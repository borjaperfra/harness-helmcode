// @vitest-environment jsdom
/**
 * La seccion de Ajustes de Helmcode: cuatro hechos del despliegue, de solo
 * lectura, cada uno con la procedencia que lo explica. Lo que se prueba aqui es
 * que la seccion dice lo que el host declara —y que dice la AUSENCIA cuando el
 * hecho no esta, en vez de pintar un valor inventado—.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  HelmcodeSettingsSection, type HelmcodeSettingsFacts, type HelmcodeSettingsSectionProps,
} from '../src/client/SettingsSection.tsx'
import { en, es } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(es) as HelmcodeSettingsSectionProps['t']
const tEn = makeTranslate(en) as HelmcodeSettingsSectionProps['t']

/** Los hechos por defecto: el despliegue del bundle. */
function facts(overrides: Partial<HelmcodeSettingsFacts> = {}): HelmcodeSettingsFacts {
  return {
    apiKeyConfigured: async () => true,
    residencyPolicy: async () => 'eu-only',
    redactionTtlDays: async () => 30,
    ...overrides,
  }
}

/**
 * Renderiza la seccion y espera a que las tres lecturas resuelvan.
 * @param subject - los hechos que la seccion lee.
 * @param translate - el diccionario activo.
 * @returns el contenedor del render.
 */
async function section(subject: HelmcodeSettingsFacts, translate = t) {
  const view = render(<HelmcodeSettingsSection {...subject} t={translate} />)
  await waitFor(() => {
    expect(view.container.textContent).not.toContain(es['settings.reading'])
  })
  return view
}

describe('Helmcode settings section', () => {
  it('shows the four deployment facts, each with where it is owned', async () => {
    const view = await section(facts())
    const text = view.container.textContent ?? ''
    expect(view.container.querySelector('[data-helmcode-settings]')).not.toBeNull()
    expect(text).toContain(es['settings.apiKey.configured'])
    expect(text).toContain(es['settings.apiKey.where'])
    // El plan asumido es el defecto de la tabla, con sus topes publicados. La
    // cifra viaja como constante de presentacion en el componente (la pureza de
    // bundles prohibe importar valores del paquete de cuota), asi que el spec
    // fija el valor esperado y NO lo lee de la tabla.
    expect(text).toContain('15')
    expect(text).toContain(es['settings.residency.eu-only'])
    expect(text).toContain(es['settings.retention.days'].replace('{days}', '30'))
  })

  it('never shows the API key value, only whether it resolves', async () => {
    const view = await section(facts({ apiKeyConfigured: async () => false }))
    const text = view.container.textContent ?? ''
    expect(text).toContain(es['settings.apiKey.missing'])
    // La seccion es de solo lectura: no hay ningun control que escriba.
    expect(view.container.querySelector('input')).toBeNull()
    expect(view.container.querySelector('button')).toBeNull()
  })

  it('declares each absence instead of inventing a value', async () => {
    const view = await section(facts({
      residencyPolicy: async () => undefined,
      redactionTtlDays: async () => undefined,
    }))
    const text = view.container.textContent ?? ''
    expect(text).toContain(es['settings.residency.absent'])
    expect(text).toContain(es['settings.retention.absent'])
  })

  it('distinguishes a map that never expires from a missing channel', async () => {
    const never = await section(facts({ redactionTtlDays: async () => null }))
    expect(never.container.textContent).toContain(es['settings.retention.never'])

    const absent = await section(facts({ redactionTtlDays: async () => undefined }))
    expect(absent.container.textContent).toContain(es['settings.retention.absent'])
  })

  it('reports a failed read as a failure, never as a value', async () => {
    const view = await section(facts({ residencyPolicy: async () => { throw new Error('carrier lost') } }))
    const text = view.container.textContent ?? ''
    expect(text).toContain(es['settings.failed'])
    expect(text).not.toContain(es['settings.residency.eu-only'])
  })

  it('speaks the English dictionary', async () => {
    const view = await section(facts(), tEn)
    const text = view.container.textContent ?? ''
    expect(text).toContain(en['settings.residency.eu-only'])
    expect(text).toContain(en['settings.retention.days'].replace('{days}', '30'))
  })
})
