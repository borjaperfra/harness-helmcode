/** Shared projection of the live LLM registry into the browser model catalog. */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
// Type-only: pulls the residency guard's Context merge, which is what types
// `ctx.get('guardEuRouting')` below. No runtime edge: the browser catalog is a
// projection of the live Host registry, and the guard decides the veto in this
// same Host context.
import type {} from '@deepseek-ai/dsh-guard-eu-routing'
// Type-only: pulls the redaction channel's Context merge, which is what types
// `ctx.get('privacy')` below and where the declared map retention is read. No
// runtime edge: the privacy plugin decides the expiry in this same Host context.
import type {} from '@deepseek-ai/dsh-privacy-helmcode'
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ModelCatalog,
  ModelReasoning,
  ModelSelection,
} from './types.ts'

/**
 * Build the browser model catalog without requiring a Session.
 *
 * Each model carries the residency the mounted guard declares for its route, so
 * the surface that renders a model reads the same declaration the veto decides
 * with instead of a second, browser-side copy of the table. The catalog also
 * carries the guard's effective MODE: the deployment's residency policy, which a
 * surface that promises European residency needs and cannot read from a model.
 *
 * @param ctx - Host context carrying the live LLM registry and, optionally, the
 * residency guard's read face.
 * @param defaultSelection - deployment default used before a Session selects a model.
 * @returns successful non-empty provider groups and isolated provider failures.
 */
export async function buildModelCatalog(
  ctx: Context,
  defaultSelection: ModelSelection = ctx.agentDefaultModel.currentSelection(),
): Promise<ModelCatalog> {
  const providers = ctx.llm.listProviders()
  // The read face answers from the guard's EFFECTIVE table —the defaults plus
  // whatever the profile adds— and reads an undeclared route as 'unknown'.
  // Without a mounted guard every route is 'unknown': nobody declared where it
  // runs, which is exactly what the guard's `eu-only` veto denies. Asked once
  // per catalog, never per row.
  const guard = ctx.get('guardEuRouting')
  // La retencion del mapa de anonimizacion la DECLARA el canal de redaccion, y
  // se lee de su seam —el mismo que aplica esa caducidad al redactar—, no de una
  // copia. `undefined` sin canal montado; `null` con el canal montado sin
  // caducidad declarada.
  const privacy = ctx.get('privacy')
  const redactionTtlDays = privacy === undefined ? undefined : privacy.ttlDays ?? null
  const catalog = await Promise.all(providers.map(async (provider) => {
    try {
      const models = await ctx.llm.listModels(provider.id)
      const entries = await Promise.all(models.map(async (model) => {
        const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id)
        const reasoning: ModelReasoning | undefined = resolved.reasoning === undefined
          ? undefined
          : {
            efforts: resolved.reasoning.efforts.map(effort => ({
              id: effort.id,
              name: effort.name,
              ...(effort.description === undefined ? {} : { description: effort.description }),
            })),
            ...(resolved.reasoning.defaultEffort === undefined
              ? {}
              : { defaultEffort: resolved.reasoning.defaultEffort }),
          }
        return {
          id: model.id,
          name: model.name,
          ...(model.description === undefined ? {} : { description: model.description }),
          ...(reasoning === undefined ? {} : { reasoning }),
          residency: guard === undefined ? 'unknown' : guard.residency(provider.id, model.id),
        }
      }))
      return {
        kind: 'group' as const,
        group: { id: provider.id, name: provider.name, models: entries },
      }
    } catch (error) {
      return {
        kind: 'failure' as const,
        failure: {
          id: provider.id,
          name: provider.name,
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }))
  const groups = catalog.flatMap(item => item.kind === 'group' ? [item.group] : [])
    .filter(group => group.models.length > 0)
  return {
    default: { ...defaultSelection },
    routableProviders: groups.map(group => group.id),
    groups,
    failures: catalog.flatMap(item => item.kind === 'failure' ? [item.failure] : []),
    // Los hechos del DESPLIEGUE viajan con el catalogo porque es la unica via de
    // lectura que la interfaz tiene del host: la guardia y el canal de redaccion
    // son plugins de host y su configuracion no llega al navegador. Sin guardia
    // montada el modo se omite, y quien prometa residencia europea se calla: la
    // ausencia es una respuesta, no un modo por defecto.
    ...guard === undefined ? {} : { residencyPolicy: guard.mode },
    ...redactionTtlDays === undefined ? {} : { redactionTtlDays },
  }
}

/**
 * Check a GUI selection against the current available provider catalog.
 * @param ctx - Host LLM registry.
 * @param selection - stored or explicitly requested selection.
 * @returns whether the exact model is currently advertised as available.
 */
export async function modelAvailable(ctx: Context, selection: ModelSelection): Promise<boolean> {
  if (!ctx.llm.listProviders().some(provider => provider.id === selection.provider)) return false
  let models: readonly LlmModelInfo[]
  try { models = await ctx.llm.listModels(selection.provider) }
  catch (error) {
    throw new RemoteError('session/model-unavailable',
      error instanceof Error ? error.message : String(error),
      { provider: selection.provider, model: selection.model })
  }
  return models.some(model => model.id === selection.model)
}

/**
 * Check configured provider API-key references independently of model availability.
 * @param ctx - Host registry, settings, and credential services.
 * @returns whether any API-key provider has a configured credential.
 */
export async function hasProviderApiKey(ctx: Context): Promise<boolean> {
  const settings = ctx.get('settings')
  const credentials = ctx.get('credentials')
  if (settings === undefined || credentials === undefined) {
    throw new RemoteError('session/provider-credentials-unavailable', 'provider credentials are unavailable', {})
  }
  const namespaces = settings.describe({ redactSecrets: true })
  for (const provider of ctx.llm.listConfigurableProviders()) {
    if (provider.provider === 'deepseek-account') continue
    let profile = namespaces.find(namespace => namespace.ns === provider.settingsNs)?.value
    for (const key of provider.settingsPath) {
      profile = typeof profile === 'object' && profile !== null ? Reflect.get(profile, key) : undefined
    }
    if (typeof profile !== 'object' || profile === null) continue
    const ref: unknown = Reflect.get(profile, 'apiKeyEnv')
    if (typeof ref === 'string' && ref.length > 0
      && (await credentials.describe(credentialRef(ref))).configured) return true
  }
  return false
}
