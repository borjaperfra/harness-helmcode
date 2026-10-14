import { describe, expect, it } from 'vitest'

import {
  ADDON_MODELS,
  DEFAULT_DEGRADATION_TARGET,
  DEFAULT_PLAN,
  HELMCODE_PROVIDER,
  KEY_LIMITS,
  LOW_WATERMARK,
  PLANS,
  SOTA_MODELS,
  UNLIMITED_MODELS,
  bucketOf,
  concurrencyLimitFor,
  largestBucket,
  monthlyCapTokens,
  quotaState,
  suggestDegradation,
} from '../src/limits.ts'

describe('atribucion por ruta', () => {
  it('no imputa a Helmcode el consumo de otra ruta que sirve los mismos modelos', () => {
    // El caso real: la ruta NaN de esta maquina sirve deepseek-v4-flash,
    // glm5.3-flash, qwen3.6 y gemma4. Contarlos como cuota de Helmcode seria
    // imputar a un plan un consumo que no es suyo.
    expect(bucketOf('nan-builders', 'deepseek-v4-flash')).toBeUndefined()
    expect(bucketOf('nan-builders', 'glm5.3-flash')).toBeUndefined()
    expect(bucketOf('nan-builders', 'qwen3.6')).toBeUndefined()
    expect(bucketOf('openai', 'gpt-6-astra')).toBeUndefined()
  })

  it('clasifica los modelos de Helmcode en su cubo', () => {
    for (const model of SOTA_MODELS) expect(bucketOf(HELMCODE_PROVIDER, model)).toBe('sota')
    for (const model of ADDON_MODELS) expect(bucketOf(HELMCODE_PROVIDER, model)).toBe('addon')
    for (const model of UNLIMITED_MODELS) expect(bucketOf(HELMCODE_PROVIDER, model)).toBe('unlimited')
  })

  it('trata como ilimitado un modelo de Helmcode que la tabla no conoce', () => {
    // Deliberado: bloquear trabajo legitimo por no saber clasificar un modelo
    // nuevo es peor que no contarlo. El aviso vive en el estado del medidor.
    expect(bucketOf(HELMCODE_PROVIDER, 'modelo-que-no-existe-todavia')).toBe('unlimited')
  })
})

describe('concurrencia', () => {
  it('da diez a los modelos de la lista alta y cinco al resto', () => {
    expect(concurrencyLimitFor('glm5.3')).toBe(10)
    expect(concurrencyLimitFor('glm5.3-flash')).toBe(10)
    expect(concurrencyLimitFor('deepseek-v4-flash')).toBe(10)
    expect(concurrencyLimitFor('qwen3.8-flash')).toBe(10)
    expect(concurrencyLimitFor('qwen3.6')).toBe(5)
    expect(concurrencyLimitFor('gemma4')).toBe(5)
  })

  it('no inventa el limite de tokens por minuto, porque la documentacion se contradice', () => {
    // docs/rate-limits dice 2M tpm; /es/pricing dice 3M. Ver discrepancia D6.
    expect(KEY_LIMITS.tokensPerMinute).toBeNull()
    expect(KEY_LIMITS.requestsPerMinute).toBe(100)
  })
})

describe('cuotas por plan', () => {
  it('da el tope del cubo correspondiente', () => {
    expect(monthlyCapTokens('starter', 'sota')).toBe(5_000_000_000)
    expect(monthlyCapTokens('growth', 'sota')).toBe(15_000_000_000)
    expect(monthlyCapTokens('scale', 'sota')).toBe(35_000_000_000)
    expect(monthlyCapTokens('starter', 'addon')).toBe(2_000_000_000)
    expect(monthlyCapTokens('scale', 'addon')).toBe(18_000_000_000)
  })

  it('no pone tope al cubo ilimitado ni a un plan a medida', () => {
    expect(monthlyCapTokens('growth', 'unlimited')).toBeNull()
    expect(monthlyCapTokens('enterprise', 'sota')).toBeNull()
    expect(monthlyCapTokens('enterprise', 'addon')).toBeNull()
  })

  it('crece de starter a scale en cada cifra publicada', () => {
    for (const key of ['apiKeys', 'sotaTokensPerMonth', 'addonTokensPerMonth', 'imagesPerMonth'] as const) {
      expect(PLANS.growth[key]!).toBeGreaterThan(PLANS.starter[key]!)
      expect(PLANS.scale[key]!).toBeGreaterThan(PLANS.growth[key]!)
    }
  })

  it('asume growth cuando el perfil no dice plan', () => {
    expect(DEFAULT_PLAN).toBe('growth')
  })
})

describe('el cubo que la tarjeta senala', () => {
  it('elige el de mayor consumo', () => {
    expect(largestBucket({ sota: 10, addon: 50, unlimited: 1 })).toEqual({ bucket: 'addon', usedTokens: 50 })
    expect(largestBucket({ sota: 10, addon: 0, unlimited: 0 })).toEqual({ bucket: 'sota', usedTokens: 10 })
  })

  it('resuelve los empates por el orden fijo de los cubos, no por el del objeto', () => {
    // Dos rutas con las mismas cifras deben pintar la misma tarjeta en
    // cualquier motor, y el orden de las claves de un objeto no es contrato.
    const expected = { bucket: 'sota', usedTokens: 7 }
    expect(largestBucket({ unlimited: 7, addon: 7, sota: 7 })).toEqual(expected)
    expect(largestBucket({ sota: 7, unlimited: 7, addon: 7 })).toEqual(expected)
  })

  it('no senala nada sin consumo, y no deja pasar cifras imposibles', () => {
    expect(largestBucket({ sota: 0, addon: 0, unlimited: 0 })).toBeUndefined()
    expect(largestBucket({ sota: Number.NaN, addon: -5, unlimited: 0 })).toBeUndefined()
    expect(largestBucket({ sota: Number.NaN, addon: 3, unlimited: 0 })).toEqual({ bucket: 'addon', usedTokens: 3 })
  })
})

describe('estado de la cuota', () => {
  it('esta en orden por debajo del aviso', () => {
    const state = quotaState('starter', 'sota', 1_000_000_000)
    expect(state.status).toBe('ok')
    expect(state.ratio).toBeCloseTo(0.2)
    expect(state.remainingTokens).toBe(4_000_000_000)
  })

  it('avisa a partir del umbral, sin bloquear', () => {
    const state = quotaState('starter', 'sota', 4_000_000_000)
    expect(state.ratio).toBeCloseTo(LOW_WATERMARK)
    expect(state.status).toBe('low')
    expect(state.remainingTokens).toBe(1_000_000_000)
  })

  it('marca agotado exactamente al llegar al tope, no antes', () => {
    expect(quotaState('starter', 'sota', 4_999_999_999).status).toBe('low')
    expect(quotaState('starter', 'sota', 5_000_000_000).status).toBe('exhausted')
    expect(quotaState('starter', 'sota', 9_000_000_000).remainingTokens).toBe(0)
    expect(quotaState('starter', 'sota', 9_000_000_000).ratio).toBeCloseTo(1.8)
  })

  it('nunca da un estado negativo ni un cubo sin tope agotado', () => {
    expect(quotaState('growth', 'sota', -500).usedTokens).toBe(0)
    const unlimited = quotaState('starter', 'unlimited', 999_999_999_999)
    expect(unlimited.status).toBe('ok')
    expect(unlimited.capTokens).toBeNull()
    expect(unlimited.ratio).toBeNull()
    expect(unlimited.degradationTarget).toBeUndefined()
  })

  it('propone degradar solo desde un cubo con tope', () => {
    expect(quotaState('starter', 'sota', 5_000_000_000).degradationTarget).toBe(DEFAULT_DEGRADATION_TARGET)
    expect(quotaState('starter', 'addon', 2_000_000_000).degradationTarget).toBe(DEFAULT_DEGRADATION_TARGET)
    expect(quotaState('starter', 'unlimited', 0).degradationTarget).toBeUndefined()
    expect(quotaState('enterprise', 'sota', 5_000_000_000).degradationTarget).toBeUndefined()
  })
})

describe('degradacion sugerida', () => {
  it('baja a un modelo ilimitado cuando la cuota del modelo pedido se agoto', () => {
    // El caso del plan: un proceso nocturno prefiere terminar con un modelo algo
    // peor a caerse con un error.
    expect(suggestDegradation('starter', HELMCODE_PROVIDER, 'deepseek-v4-flash', 5_000_000_000))
      .toBe(DEFAULT_DEGRADATION_TARGET)
    expect(suggestDegradation('starter', HELMCODE_PROVIDER, 'glm5.3', 2_000_000_000))
      .toBe(DEFAULT_DEGRADATION_TARGET)
  })

  it('no toca nada mientras quede cuota, ni baja desde un modelo ilimitado', () => {
    expect(suggestDegradation('growth', HELMCODE_PROVIDER, 'deepseek-v4-flash', 1)).toBeUndefined()
    expect(suggestDegradation('starter', HELMCODE_PROVIDER, 'qwen3.6', 999_999_999_999)).toBeUndefined()
  })

  it('no propone cambiar a un modelo por otra ruta', () => {
    // Sin ruta Helmcode no hay cuota de Helmcode que agotar.
    expect(suggestDegradation('starter', 'nan-builders', 'deepseek-v4-flash', 999_999_999_999)).toBeUndefined()
  })

  it('no degrada al mismo modelo que ya se pedia', () => {
    // Si el suelo y el techo coincidieran, degradar seria un bucle.
    expect(suggestDegradation('starter', HELMCODE_PROVIDER, DEFAULT_DEGRADATION_TARGET, 0)).toBeUndefined()
  })
})
