/**
 * Onboarding de la API key de Helmcode: los tres pasos que el usuario recorre
 * cuando el credential store no resuelve `HELMCODE_API_KEY`.
 *
 * El panel NO decide si la clave existe mirando la configuracion: comprueba si
 * el credential store la resuelve, que es la unica pregunta cuya respuesta es
 * la verdad. La clave se escribe por el dominio de credenciales, nunca en el
 * fichero de configuracion del perfil.
 *
 * El paso 3 elige el modelo por defecto entre los CUATRO que sirve la ruta
 * europea declarada por el bundle; los nueve modelos frontera que la misma
 * clave sirve desde Estados Unidos no se ofrecen aqui.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Onboarding.module.css'

/** El asiento de locale del paquete. */
type OnboardingLocale = PropsLocale<'helmcode'>

/** Lo que el panel necesita del dominio de credenciales. */
export interface HelmcodeCredentialFace {
  /**
   * Si el credential store resuelve la clave.
   * @returns cierto cuando el host ya tiene una clave utilizable.
   */
  isConfigured: () => Promise<boolean>
  /**
   * Escribe la clave en el credential store.
   * @param value - el literal que el usuario pego.
   * @returns el motivo del rechazo, o `undefined` cuando se guardo.
   */
  set: (value: string) => Promise<string | undefined>
}

/** Los tres pasos del panel, en orden. */
export const STEPS = ['one', 'two', 'three'] as const

/** El nombre del paso activo. */
type StepId = typeof STEPS[number]

/**
 * Los cuatro modelos que la ruta europea sirve, con la clave de locale de cada
 * uno. La ruta y el identificador coinciden con la tabla de residencia del
 * bundle (`helmcode/<id>`), que es la que decide que es europeo.
 */
export const EU_MODELS = [
  { provider: 'helmcode', model: 'deepseek-v4-flash' },
  { provider: 'helmcode', model: 'glm5.3-flash' },
  { provider: 'helmcode', model: 'qwen3.6' },
  { provider: 'helmcode', model: 'gemma4' },
] as const

/** La URL de la consola donde se crea la clave. */
export const CONSOLE_URL = 'https://cloud.helmcode.com'

/** El enlace de la consola, compartido por el panel y su prueba. */
export function consoleHref(): string {
  return `${CONSOLE_URL}/api-keys`
}

/** Lo que el panel lee de la credencial. */
type Configured = 'unknown' | 'yes' | 'no'

/** Un modelo de los cuatro europeos. */
export type EuModel = typeof EU_MODELS[number]

/** La clave de locale del nombre de un modelo europeo. */
export type ModelKey =
  | 'onboarding.model.helmcode/deepseek-v4-flash'
  | 'onboarding.model.helmcode/glm5.3-flash'
  | 'onboarding.model.helmcode/qwen3.6'
  | 'onboarding.model.helmcode/gemma4'

/**
 * La clave de locale del nombre de un modelo.
 * @param model - uno de los cuatro modelos europeos.
 * @returns la clave del diccionario.
 */
export function modelKey(model: EuModel): ModelKey {
  return `onboarding.model.${model.provider}/${model.model}`
}

/** Las dependencias inyectadas por el registro del paso. */
export interface HelmcodeOnboardingDeps extends OnboardingLocale {
  /** Cara de credenciales que el plugin construye en su `apply`. */
  credentials: HelmcodeCredentialFace
}

/** Las props del paso de onboarding. */
export type HelmcodeOnboardingProps =
  PropsRuntime<'settings.onboarding'> & HelmcodeOnboardingDeps

/**
 * El panel: tres pasos, uno cada vez, sobre el paso de onboarding de settings.
 * @param props - credenciales, asiento de locale y ciclo del coordinador.
 * @returns el panel, o nada mientras la credencial se esta comprobando.
 */
export function HelmcodeOnboarding({ credentials, t, complete }: HelmcodeOnboardingProps): ReactNode {
  const [configured, setConfigured] = useState<Configured>('unknown')
  const [step, setStep] = useState<StepId>('one')
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState<EuModel | null>(null)

  /**
   * Comprueba el credential store UNA vez, al montar. La respuesta se publica
   * solo si el paso sigue montado, y un rechazo del host se lee como "sin
   * clave": el panel no se queda esperando una respuesta que no va a llegar.
   */
  useEffect(() => {
    let live = true
    void (async (): Promise<void> => {
      let has = false
      try {
        has = await credentials.isConfigured()
      } catch {
        has = false
      }
      // La bandera se lee despues del `await`, que es justo el punto en que el
      // paso puede haberse desmontado: el analizador la ve siempre cierta
      // porque solo mira el camino sincrono.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- la cancelacion solo es observable tras el await
      if (!live) return
      setConfigured(has ? 'yes' : 'no')
    })()
    return () => { live = false }
  }, [credentials])

  // Sin respuesta todavia el paso no pinta chrome: el coordinador no debe
  // bloquear nada mientras se decide si este paso hace falta.
  if (configured === 'unknown') return null
  // Con la clave ya resuelta el paso se completa solo y no estorba.
  if (configured === 'yes') {
    complete()
    return null
  }

  const next = (): void => {
    if (step === 'one') setStep('two')
  }

  /** El paso del modelo, al que se llega guardando la clave. */
  const MODEL_STEP: StepId = 'two'

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    const refusal = await credentials.set(key)
    setSaving(false)
    if (refusal === undefined) {
      setStep(MODEL_STEP)
      return
    }
    setError(refusal)
  }

  const choose = (choice: EuModel): void => {
    setModel(choice)
    complete()
  }

  return (
    <div className={css.scrim}>
      <section className={css.panel} role="dialog" aria-modal="true" aria-label={t('onboarding.title')}>
        <span className={css.eyebrow}>{t('eyebrow.plan')}</span>
        <h2 className={css.title}>{t('onboarding.title')}</h2>
        <p className={css.stepLabel}>{t('onboarding.stepLabel', { step: STEPS.indexOf(step) + 1, total: STEPS.length })}</p>

        <section className={css.step} data-step={step}>
          <h3 className={css.stepTitle}>{t('onboarding.createKey')}</h3>
          <p className={css.body}>{t('onboarding.consoleHint')}</p>
          <a className={css.link} href={consoleHref()} target="_blank" rel="noreferrer">
            {t('onboarding.openConsole')}
          </a>
          <button type="button" className={css.action} onClick={next}>{t('onboarding.next')}</button>
        </section>

        <section className={css.step} data-step={step}>
          <h3 className={css.stepTitle}>{t('onboarding.pasteKey')}</h3>
          <p className={css.body}>{t('onboarding.pasteHint')}</p>
          <input
            className={css.input}
            type="password"
            aria-label={t('onboarding.pasteKey')}
            placeholder={t('onboarding.pastePlaceholder')}
            value={key}
            onChange={(event) => {
              setKey(event.target.value)
              setError(null)
            }}
          />
          {error === null ? null : <p className={css.error} role="alert">{t('onboarding.saveError')}</p>}
          <button type="button" className={css.action} data-role="save" disabled={saving} onClick={() => { void save() }}>
            {saving ? t('onboarding.saving') : t('onboarding.save')}
          </button>
        </section>

        <section className={css.step} data-step={step}>
          <h3 className={css.stepTitle}>{t('onboarding.chooseModel')}</h3>
          <p className={css.body}>{t('onboarding.modelsHint')}</p>
          <div className={css.models}>
            {EU_MODELS.map(entry => (
              <button
                key={entry.model}
                type="button"
                className={model?.model === entry.model ? `${css.model} ${css.modelPicked}` : css.model}
                aria-pressed={model?.model === entry.model}
                onClick={() => { choose(entry) }}
              >
                {t(modelKey(entry))}
              </button>
            ))}
          </div>
        </section>
      </section>
    </div>
  )
}
