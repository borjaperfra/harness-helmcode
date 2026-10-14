// @vitest-environment jsdom
/**
 * El onboarding de la API key: los tres pasos, la escritura por el dominio de
 * credenciales y las dos salidas honestas — la clave ya estaba, o el host la
 * rechaza y el panel lo dice.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn, es as commonEs } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import {
  CONSOLE_URL, EU_MODELS, HelmcodeOnboarding, consoleHref, modelKey,
  type HelmcodeCredentialFace, type HelmcodeOnboardingProps,
} from '../src/client/Onboarding.tsx'
import { en, es } from '../src/client/locales.ts'
import css from '../src/client/Onboarding.module.css'

afterEach(cleanup)

/** El asiento de locale del panel y sus atajos de consulta. */
const t = makeTranslate(es, commonEs) as HelmcodeOnboardingProps['t']
const tEn = makeTranslate(en, commonEn) as HelmcodeOnboardingProps['t']

/** La clave pegada, que es el input del paso 2. */
const INPUT = `.${css.input}` as const
/** Los botones de accion; el de guardar es el del paso 2. */
const ACTIONS = `.${css.action}` as const
/** Los botones de modelo. */
const MODELS = `.${css.model}` as const
/** El aviso de rechazo del host. */
const ERROR = `.${css.error}` as const

/** El boton de guardar del paso 2, marcado por su papel. */
const SAVE = '[data-role="save"]' as const

/**
 * El boton que escribe la clave.
 * @param container - el contenedor montado.
 * @returns el boton del paso 2.
 */
function saveButton(container: HTMLElement): Element {
  return container.querySelector(SAVE) as Element
}

/**
 * Una cara de credenciales de prueba.
 * @param configured - si la clave ya esta, o el error con el que la lectura falla.
 * @param refusal - el motivo con el que el host rechaza la escritura.
 * @returns la cara y sus espias.
 */
function face(configured: boolean | Error, refusal?: string) {
  const set = vi.fn(async () => refusal)
  const isConfigured = configured instanceof Error
    ? vi.fn(async () => { throw configured })
    : vi.fn(async () => configured)
  return { credentials: { isConfigured, set } as HelmcodeCredentialFace, isConfigured, set }
}

/** Monta el panel y espera a que la comprobacion de credencial resuelva. */
async function panel(
  credentials: HelmcodeCredentialFace,
  overrides: Partial<HelmcodeOnboardingProps> = {},
) {
  const complete = vi.fn()
  const props = {
    credentials,
    t,
    stepId: 'helmcode-api-key',
    complete,
    openSection: vi.fn(),
    ...overrides,
  } as unknown as HelmcodeOnboardingProps
  const view = render(<HelmcodeOnboarding {...props} />)
  await waitFor(() => { expect(credentials.isConfigured).toHaveBeenCalled() })
  await waitFor(() => { expect(view.container.innerHTML).not.toBe('') }, { timeout: 2000, interval: 20 })
  return { ...view, complete }
}

describe('HelmcodeOnboarding', () => {
  it('no pinta chrome mientras la credencial se esta comprobando', () => {
    const credentials: HelmcodeCredentialFace = { isConfigured: () => new Promise(() => {}), set: vi.fn() }
    const props = {
      credentials, t, stepId: 's', complete: vi.fn(), openSection: vi.fn(),
    } as unknown as HelmcodeOnboardingProps
    const { container } = render(<HelmcodeOnboarding {...props} />)
    expect(container.innerHTML).toBe('')
  })

  it('con la clave ya resuelta completa el paso sin estorbar', async () => {
    const { credentials, isConfigured } = face(true)
    const complete = vi.fn()
    const props = {
      credentials, t, stepId: 's', complete, openSection: vi.fn(),
    } as unknown as HelmcodeOnboardingProps
    const { container } = render(<HelmcodeOnboarding {...props} />)
    await waitFor(() => { expect(complete).toHaveBeenCalledTimes(1) })
    expect(isConfigured).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe('')
  })

  it('no publica la comprobacion de la credencial si el paso se desmonta antes', async () => {
    let settle: ((has: boolean) => void) | undefined
    const credentials: HelmcodeCredentialFace = {
      isConfigured: () => new Promise<boolean>((resolve) => { settle = resolve }),
      set: vi.fn(),
    }
    const props = {
      credentials, t, stepId: 's', complete: vi.fn(), openSection: vi.fn(),
    } as unknown as HelmcodeOnboardingProps
    const view = render(<HelmcodeOnboarding {...props} />)
    expect(view.container.innerHTML).toBe('')
    view.unmount()
    // La respuesta llega cuando el paso ya no esta: publicarla seria escribir
    // estado en un componente desmontado.
    settle?.(false)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(view.container.innerHTML).toBe('')
  })

  it('un credential store que falla se lee como "sin clave", no como un panel colgado', async () => {
    const { credentials, isConfigured } = face(new Error('no provider mounted'))
    const { container } = await panel(credentials)
    expect(isConfigured).toHaveBeenCalled()
    expect(container.textContent).toContain(es['onboarding.createKey'])
  })

  it('guia los tres pasos con su rotulo, del alta en la consola al modelo', async () => {
    const { credentials } = face(false)
    const { container } = await panel(credentials)

    expect(container.textContent)
      .toContain(es['onboarding.stepLabel'].replace('{step}', '1').replace('{total}', '3'))
    expect(container.textContent).toContain(es['onboarding.createKey'])
    expect(container.textContent).toContain(es['onboarding.consoleHint'])
    const link = container.querySelector(`.${css.link}`)
    expect(link?.getAttribute('href')).toBe(consoleHref())
    expect(consoleHref()).toBe(`${CONSOLE_URL}/api-keys`)
    expect(link?.getAttribute('target')).toBe('_blank')

    expect(container.textContent).toContain(es['onboarding.pasteKey'])
    expect(container.textContent).toContain(es['onboarding.chooseModel'])
    // Los CUATRO modelos europeos que la ruta sirve. La tabla no declara
    // ninguno de los nueve frontera que la misma clave sirve desde EE. UU.
    const models = [...container.querySelectorAll(`.${css.model}`)].map(node => node.textContent)
    expect(models).toEqual(EU_MODELS.map(entry => es[modelKey(entry)]))
  })

  it('guarda la clave pegada y no cierra el panel hasta elegir modelo', async () => {
    const { credentials, set } = face(false)
    const { container, complete } = await panel(credentials)
    const input = container.querySelector(INPUT)
    expect(input?.getAttribute('type')).toBe('password')
    expect(input?.getAttribute('placeholder')).toBe(es['onboarding.pastePlaceholder'])
    // Antes de guardar, el panel esta en el paso 1.
    expect(container.querySelector('[data-step="one"]')).not.toBeNull()
    expect(saveButton(container).getAttribute('data-role')).toBe('save')
    fireEvent.change(input as Element, { target: { value: 'hc-live-123' } })
    fireEvent.click(saveButton(container))
    await waitFor(() => { expect(set).toHaveBeenCalledWith('hc-live-123') })
    expect(complete).not.toHaveBeenCalled()
    expect(container.querySelector(ERROR)).toBeNull()
    // El guardado deja el paso del modelo a la vista y mueve el rotulo.
    await waitFor(() => { expect(container.querySelector('[data-step="two"]')).not.toBeNull() })
    expect(container.textContent)
      .toContain(es['onboarding.stepLabel'].replace('{step}', '2').replace('{total}', '3'))
  })

  it('el rotulo de paso avanza con el boton de continuar', async () => {
    const { credentials } = face(false)
    const { container } = await panel(credentials)
    const reading = (step: number): string =>
      es['onboarding.stepLabel'].replace('{step}', String(step)).replace('{total}', '3')
    expect(container.textContent).toContain(reading(1))
    fireEvent.click(container.querySelector(ACTIONS) as Element)
    await waitFor(() => { expect(container.querySelector('[data-step="two"]')).not.toBeNull() })
    expect(container.textContent).toContain(reading(2))
    // El boton de continuar pertenece al primer paso: una vez fuera de el, no
    // queda nada que avanzar y el rotulo se queda donde esta.
    fireEvent.click(container.querySelector(ACTIONS) as Element)
    expect(container.textContent).toContain(reading(2))
    expect(container.querySelector('[data-step="three"]')).toBeNull()
  })

  it('ensena el rechazo del host y no avanza: la clave no esta guardada', async () => {
    const { credentials } = face(false, 'read-only source shadows HELMCODE_API_KEY')
    const { container } = await panel(credentials)
    fireEvent.change(container.querySelector(INPUT) as Element, { target: { value: 'x' } })
    fireEvent.click(saveButton(container))
    await waitFor(() => { expect(container.querySelector(ERROR)).not.toBeNull() })
    expect(container.querySelector(ERROR)?.textContent).toBe(es['onboarding.saveError'])
    expect(container.querySelector(ERROR)?.getAttribute('role')).toBe('alert')
    // Y al volver a escribir, el aviso se retira: describe el intento anterior.
    fireEvent.change(container.querySelector(INPUT) as Element, { target: { value: 'y' } })
    expect(container.querySelector(ERROR)).toBeNull()
  })

  it('cierra el onboarding al elegir el modelo por defecto', async () => {
    const { credentials } = face(false)
    const { container, complete } = await panel(credentials)
    const models = [...container.querySelectorAll(MODELS)]
    expect(models).toHaveLength(4)
    fireEvent.click(models[0] as Element)
    expect(complete).toHaveBeenCalledTimes(1)
    // La eleccion queda marcada antes de que el coordinador desmonte el paso.
    expect(models[0]?.getAttribute('aria-pressed')).toBe('true')
    expect(models[0]?.className).toContain(css.modelPicked)
  })

  it('rotula los nombres de modelo en el idioma activo, nunca con el identificador', async () => {
    const { credentials } = face(false)
    const { container } = await panel(credentials, { t: tEn })
    expect(container.textContent).toContain(en['onboarding.model.helmcode/deepseek-v4-flash'])
    expect(container.textContent).not.toContain('deepseek-v4-flash')
  })

  it('nombra el modelo por su clave de locale', () => {
    expect(modelKey(EU_MODELS[2])).toBe('onboarding.model.helmcode/qwen3.6')
  })
})
