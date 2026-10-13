/**
 * Redaccion reversible de PII espanola para Helmcode: detectores con checksum
 * real, mapa determinista persistible y cifrado con fallo cerrado.
 *
 * Este fichero es el CABLEADO: monta el plugin y registra las dos herramientas
 * con las que el agente redacta. No hay interceptor: la capacidad es explicita
 * por diseno (plan §18), porque el waterfall `llm/stream` prohibe reescribir la
 * peticion que construye el bucle y no existe un gancho global de admision de
 * contenido. El agente redacta cuando usa `anonymize` o
 * `workspace_read_anonymized`, y solo entonces.
 *
 * **Fallo cerrado**: la clave se resuelve en el credential store y el mapa se
 * abre ANTES de mirar el texto. Si la clave no esta, si el sobre no descifra o
 * si el mapa no se puede escribir, la herramienta FALLA; en ningun camino
 * devuelve el texto sin redactar.
 *
 * El mapa vive entre sesiones (mismo valor → mismo marcador) en la ruta que el
 * perfil declare o, por defecto, en `<DSH_HOME>/privacy/map.v1`, sellado con
 * AES-256-GCM y reemplazado de forma atomica.
 *
 * @module @deepseek-ai/dsh-privacy-helmcode
 */

import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import z from '@deepseek-ai/schemastery'
import { detectPii, type PiiType } from './detect.ts'
import { RedactionMap } from './map.ts'
import { redactText, type RedactionFinding } from './redact.ts'
import { open, seal } from './seal.ts'

export * from './detect.ts'
export * from './map.ts'
export * from './redact.ts'
export * from './seal.ts'

/** Nombre del plugin para los diagnosticos del loader. */
export const name = 'privacy-helmcode'

/**
 * Los dos seams que hay que inyectar: `tools` (el registro por el que se
 * publican las dos herramientas) y `credentials` (de donde sale la clave del
 * mapa, que NO viaja en el patch del bundle).
 *
 * `fs` no esta aqui a proposito: la lectura de `workspace_read_anonymized` va
 * por el seam de ficheros cuando la composicion lo monta, pero exigirlo en
 * `inject` desmontaria tambien `anonymize` —que no lee ficheros— en una
 * composicion sin filesystem. La herramienta lo resuelve en cada llamada
 * (`ctx.get('fs')`) y se niega si no esta.
 */
export const inject = ['tools', 'credentials']

/** La referencia de credencial por defecto de la clave del mapa. */
export const DEFAULT_MAP_KEY_REF = 'PRIVACY_MAP_KEY'

/** Los segmentos, bajo el home del harness, de la ruta por defecto del mapa. */
export const DEFAULT_MAP_SEGMENTS: readonly string[] = ['privacy', 'map.v1']

/**
 * El limite por defecto, en bytes, de una lectura anonimizada. Una lectura que
 * no cabe se NIEGA en vez de truncarse: cortar el texto podria partir un valor
 * por la mitad y dejar su mitad fuera de la redaccion.
 */
export const DEFAULT_MAX_BYTES = 1_048_576

/** Milisegundos de un dia, para expresar la caducidad en dias. */
const MS_PER_DAY = 86_400_000

/** Los permisos del fichero sellado y de su directorio: solo el usuario. */
const MAP_FILE_MODE = 0o600
const MAP_DIR_MODE = 0o700

/**
 * La ruta por defecto del mapa sellado bajo el home del harness.
 *
 * @param home - el home ya resuelto; por defecto, el de esta maquina.
 * @returns la ruta absoluta `<home>/privacy/map.v1`.
 */
export function defaultMapPath(home: string = resolveDshHome()): string {
  return join(home, ...DEFAULT_MAP_SEGMENTS)
}

/** La configuracion del plugin, tal como la declara el perfil. */
export interface Config {
  /**
   * Ruta del fichero sellado. Ausente: `<DSH_HOME>/privacy/map.v1`, resuelto con
   * `resolveDshHome` en el momento de montar el plugin.
   */
  mapPath?: string
  /**
   * Referencia de credencial que guarda la clave del mapa. Ausente:
   * `PRIVACY_MAP_KEY`. La clave no se declara aqui: vive en el credential store.
   */
  mapKeyRef?: string
  /**
   * Caducidad, en dias, de las entradas NUEVAS del mapa. Ausente: las entradas
   * no caducan. Una entrada caducada no se restaura (el mapa lo niega), pero su
   * marcador sigue en el historial.
   */
  ttlDays?: number
}

/**
 * Esquema de configuracion NATIVO de Schemastery, que es el unico que el
 * validador de config del harness reconoce (`packages/boot/app-boot/src/config-schema/collect.ts`:
 * un esquema que no sea Schemastery nativo se marca `unsupported`). Los tres
 * campos son opcionales; sin ninguno, el plugin usa sus valores por defecto.
 */
export const Config: z<Config> = z.object({
  mapPath: z.string(),
  mapKeyRef: z.string(),
  ttlDays: z.number(),
})

/**
 * El fichero del mapa sellado, con carga perezosa y fallo cerrado.
 *
 * Cada operacion ocurre bajo el cerrojo del fichero (`<mapPath>.lock`, el mismo
 * protocolo que usa `dsh-credentials-local`): dentro de el se relee el sobre y,
 * si otro escritor lo cambio desde la ultima lectura, se ADOPTA lo que hay en
 * disco como base antes de acunar marcadores. Asi una segunda instancia —o un
 * segundo proceso— no reemplaza las entradas que no habia visto, que es lo que
 * dejaria marcadores sin forma de volver.
 *
 * La clave NO se cachea: el seam de credenciales resuelve por operacion, y esa
 * lectura por operacion es lo que hace que una clave rotada llegue a la
 * siguiente llamada sin reiniciar.
 */
class SealedMapFile {
  /** El mapa vigente; `undefined` hasta la primera lectura. */
  private map: RedactionMap | undefined

  /** El sobre tal como se leyo o se escribio por ultima vez. */
  private sealed: string | undefined

  /**
   * @param ctx - contexto del plugin, para leer la clave del credential store.
   * @param path - ruta absoluta del fichero sellado.
   * @param keyRef - referencia de credencial de la clave.
   */
  constructor(
    private readonly ctx: Context,
    private readonly path: string,
    private readonly keyRef: string,
  ) {}

  /**
   * La clave del mapa, resuelta en el credential store.
   *
   * @returns el valor de la credencial.
   * @throws cuando la referencia no tiene la forma de una credencial o cuando no
   * hay valor: sin clave no se abre ni se sella nada, y la herramienta se niega.
   */
  private async resolveKey(): Promise<string> {
    let ref: CredentialRef
    try {
      ref = credentialRef(this.keyRef)
    } catch (error) {
      throw new Error(
        `privacy-helmcode: "${this.keyRef}" is not a valid credential reference (${String(error)}), so the sealed map at ${this.path} cannot be opened`,
      )
    }
    const credential = await this.ctx.credentials.resolve(ref)
    if (credential === undefined) {
      throw new Error(
        `privacy-helmcode: no credential is configured for ${this.keyRef}, so the sealed map at ${this.path} cannot be opened or written; store the map key in the credential store and retry`,
      )
    }
    return credential.value
  }

  /**
   * El sobre tal como esta en disco, o `undefined` cuando el fichero no existe.
   *
   * Un fichero ausente es un mapa nuevo (primer uso); cualquier otro fallo de
   * lectura —permisos, un directorio en esa ruta, la unidad caida— es un fallo
   * que la herramienta no puede tapar.
   */
  private async readSealed(): Promise<string | undefined> {
    try {
      return await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
      throw new Error(`privacy-helmcode: cannot read the sealed map at ${this.path}: ${String(error)}`)
    }
  }

  /**
   * Descifra y parsea un sobre. Ni degrada ni devuelve un mapa vacio: nombra la
   * causa (clave incorrecta, sobre manipulado o documento corrupto) y se niega.
   *
   * @param sealed - el sobre tal como esta en disco.
   * @param key - la clave resuelta.
   */
  private parseSealed(sealed: string, key: string): RedactionMap {
    let plaintext: string
    try {
      plaintext = open(sealed, key)
    } catch (error) {
      throw new Error(
        `privacy-helmcode: cannot decrypt the sealed map at ${this.path} (${String(error)}); the tools refuse rather than continue without the map`,
      )
    }
    try {
      return RedactionMap.parse(plaintext)
    } catch (error) {
      throw new Error(
        `privacy-helmcode: the sealed map at ${this.path} decrypted but does not hold a valid map document (${String(error)})`,
      )
    }
  }

  /**
   * Aplica una operacion al mapa vigente y sella el resultado si cambio.
   *
   * @param operation - la operacion pura sobre el mapa; devuelve su valor.
   * @returns el valor de la operacion y si el mapa tuvo que sellarse.
   */
  async update<T>(operation: (map: RedactionMap) => T): Promise<{ value: T; changed: boolean }> {
    // El cerrojo es un hermano del fichero, asi que su directorio tiene que
    // existir antes de tomarlo.
    await mkdir(dirname(this.path), { recursive: true, mode: MAP_DIR_MODE })
    return withFileLock(this.path, async () => {
      const key = await this.resolveKey()
      const sealed = await this.readSealed()
      if (this.map === undefined || sealed !== this.sealed) {
        this.map = sealed === undefined ? new RedactionMap() : this.parseSealed(sealed, key)
        this.sealed = sealed
      }
      const before = this.map.toJSON()
      const value = operation(this.map)
      const after = this.map.toJSON()
      if (after === before) return { value, changed: false }
      // El reemplazo es atomico y el fallo de escritura NO se tapa: sube tal
      // cual —con su causa y su ruta— y la herramienta falla, porque un mapa
      // que no se persiste deja marcadores sin forma de volver. La memoria
      // conserva lo acunado, asi que un fallo temporal se recupera en la
      // siguiente operacion que si escriba.
      const next = seal(after, key)
      await writeFileAtomic(this.path, next, { mode: MAP_FILE_MODE, dirMode: MAP_DIR_MODE })
      this.sealed = next
      return { value, changed: true }
    })
  }
}

/** El recuento de una redaccion: que tipos aparecieron y cuantas veces. */
interface RedactionCount {
  readonly type: PiiType
  readonly count: number
}

/** Cuenta los hallazgos por tipo, en orden de puntos de codigo (estable). */
function countByType(findings: readonly RedactionFinding[]): RedactionCount[] {
  const counts = new Map<PiiType, number>()
  for (const finding of findings) counts.set(finding.type, (counts.get(finding.type) ?? 0) + 1)
  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => (left.type < right.type ? -1 : 1))
}

/**
 * El texto model-facing de un resultado de redaccion: la cabecera con el
 * recuento por tipo y, debajo, el texto ya redactado. Declara siempre lo mismo
 * sobre el original, porque es donde el diseno acepta el compromiso: el ORIGINAL
 * queda en el log local de la sesion y el mapa sellado es el unico camino de
 * vuelta.
 *
 * @param source - de donde salio el texto (el argumento o la ruta del fichero).
 * @param text - el texto redactado.
 * @param findings - los hallazgos sustituidos.
 * @param mapChanged - si el mapa tuvo que sellarse por esta llamada.
 */
function renderRedaction(
  source: string,
  text: string,
  findings: readonly RedactionFinding[],
  mapChanged: boolean,
): string {
  if (findings.length === 0) {
    return `No Spanish PII was detected in ${source}: nothing was redacted. `
      + 'The local session log keeps the original content.'
      + `\n\n${text}`
  }
  const counts = countByType(findings).map(count => `${count.type} ${count.count}`).join(', ')
  return `Redacted ${findings.length} value(s) in ${source}: ${counts}. `
    + `Map ${mapChanged ? 'sealed and saved' : 'unchanged'}; the original content stays in the local session log.`
    + `\n\n${text}`
}

/**
 * Redacta un texto contra el mapa, aplicando a las entradas nuevas la caducidad
 * declarada.
 *
 * La caducidad se aplica ANTES de redactar, con el mismo orden de deteccion que
 * usa el nucleo: el nucleo puro no conoce la configuracion, asi que aqui se
 * acunan las entradas nuevas (`assign` es idempotente para un valor ya presente)
 * y despues `redactText` solo lee los marcadores. La numeracion es la misma que
 * habria producido la redaccion sola.
 *
 * @param store - el fichero del mapa.
 * @param text - el texto original.
 * @param ttlDays - la caducidad declarada, si la hay.
 * @returns el resultado de la redaccion y si el mapa cambio.
 */
async function redactThrough(
  store: SealedMapFile,
  text: string,
  ttlDays: number | undefined,
): Promise<{ text: string; findings: readonly RedactionFinding[]; mapChanged: boolean }> {
  const outcome = await store.update((map) => {
    if (ttlDays !== undefined) {
      const createdAt = new Date()
      const expiresAt = new Date(createdAt.getTime() + ttlDays * MS_PER_DAY)
      for (const finding of detectPii(text)) {
        map.assign(finding.type, finding.value, { createdAt, expiresAt })
      }
    }
    return redactText(text, map)
  })
  return { text: outcome.value.text, findings: outcome.value.findings, mapChanged: outcome.changed }
}

/**
 * Comprueba que un limite de bytes es utilizable antes de leer nada.
 *
 * @param maxBytes - el limite declarado por el modelo.
 */
function requireMaxBytes(maxBytes: number): number {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('privacy-helmcode: maxBytes must be a positive integer')
  }
  return maxBytes
}

/**
 * Cablea el canal de redaccion: el fichero sellado del mapa y las dos
 * herramientas que lo usan.
 *
 * @param ctx - contexto del plugin.
 * @param config - configuracion ya validada por {@link Config}.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const mapPath = config.mapPath ?? defaultMapPath()
  const mapKeyRef = config.mapKeyRef ?? DEFAULT_MAP_KEY_REF
  const ttlDays = config.ttlDays
  if (ttlDays !== undefined && (!Number.isFinite(ttlDays) || ttlDays <= 0)) {
    throw new Error('privacy-helmcode: ttlDays must be a positive number of days')
  }
  const store = new SealedMapFile(ctx, mapPath, mapKeyRef)

  ctx.tools.register(defineTool({
    name: 'anonymize',
    description:
      'Replace Spanish personal data (DNI/NIE, IBAN, card, social-security number, phone, email, '
      + 'plate, health-record number) in the given text with stable placeholders and return the redacted text. '
      + 'The same value always yields the same placeholder, because the map persists across sessions under the '
      + "profile's home, encrypted with a key from the credential store. The ORIGINAL text stays in the local "
      + 'session log: only the redacted text is dispatched to the model, and the placeholders can be restored '
      + 'only by an operator holding the sealed map and its key. If the map cannot be read or decrypted, this '
      + 'tool fails instead of returning unredacted text.',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'Text to redact. Spanish PII is replaced by placeholders such as [DNI_1]; anything else is returned unchanged.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await redactThrough(store, args.text, ttlDays)
      return renderRedaction('the text argument', result.text, result.findings, result.mapChanged)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workspace_read_anonymized',
    description:
      'Read a UTF-8 text file and return its content with Spanish personal data replaced by the same stable '
      + 'placeholders `anonymize` uses. The file is read through the filesystem seam, so the workspace rules of '
      + 'this composition govern the path, and the file itself is never modified. The ORIGINAL content stays on '
      + 'disk and in the local session log: only the redacted text is dispatched to the model, and restoring the '
      + 'values is a manual operation with the sealed map and its key. If the map cannot be read or decrypted, '
      + 'this tool fails instead of returning unredacted text.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Path of an existing UTF-8 text file. Relative paths resolve against the session working directory.',
      },
      maxBytes: {
        type: 'integer',
        description: `Largest file this call accepts, in bytes (default ${String(DEFAULT_MAX_BYTES)}). A larger file is refused, not truncated.`,
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args: ReadAnonymizedArgs, exec: ToolExecution) {
      const fs = ctx.get('fs')
      if (fs === undefined) {
        throw new Error(
          'privacy-helmcode: workspace_read_anonymized reads through the filesystem seam (ctx.fs), which this '
          + 'composition does not mount; the read is refused rather than done outside the seam',
        )
      }
      const maxBytes = requireMaxBytes(args.maxBytes ?? DEFAULT_MAX_BYTES)
      // La lectura va por el seam: la ruta se resuelve en el mundo de ejecucion
      // del backend (con el cwd de la sesion), el tipo y el tamano los declara
      // el, y el texto lo decodifica el. NO se emite `fs/observed`: el modelo no
      // ha visto los bytes reales del fichero, ha visto marcadores, asi que esta
      // llamada no cuenta como haberlo observado y una edicion posterior sigue
      // exigiendo un `read` (la guardia de observacion es lo que impide editar a
      // ciegas, y aqui la vision es parcial a proposito).
      const cwd = exec.agent?.session.header.cwd
      const target = await fs.resolve(args.path, {
        ...(cwd === undefined ? {} : { cwd }),
        signal: exec.signal,
      })
      const info = await fs.stat(target, exec.signal)
      if (info === undefined) {
        throw new Error(`privacy-helmcode: cannot read "${target.displayPath}": not found`)
      }
      if (info.type !== 'file') {
        throw new Error(`privacy-helmcode: cannot read "${target.displayPath}": not a regular file`)
      }
      const size = info.size
      if (size !== undefined && size > maxBytes) throw tooLarge(target.displayPath, size, maxBytes)
      const content = await fs.readText(target, exec.signal)
      // Un backend puede no declarar el tamano en `stat`; el limite se comprueba
      // igualmente sobre los bytes que se van a redactar.
      const bytes = Buffer.byteLength(content, 'utf8')
      if (bytes > maxBytes) throw tooLarge(target.displayPath, bytes, maxBytes)
      const result = await redactThrough(store, content, ttlDays)
      return renderRedaction(target.displayPath, result.text, result.findings, result.mapChanged)
    },
  }))
}

/** Los argumentos validados de `workspace_read_anonymized`. */
interface ReadAnonymizedArgs {
  readonly path: string
  readonly maxBytes?: number
}

/**
 * El fallo por tamano: se nombra el fichero, lo que mide y el limite, y se dice
 * por que no se trunca.
 *
 * @param displayPath - ruta tal como la presenta el backend.
 * @param bytes - el tamano observado.
 * @param maxBytes - el limite de esta llamada.
 */
function tooLarge(displayPath: string, bytes: number, maxBytes: number): Error {
  return new Error(
    `privacy-helmcode: refusing to read "${displayPath}": ${String(bytes)} bytes exceed the ${String(maxBytes)}-byte cap, `
    + 'and truncating could cut a value in half; pass a larger maxBytes or read the file with the read tool',
  )
}
