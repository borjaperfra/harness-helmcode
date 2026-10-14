import { describe, expect, it } from 'vitest'
import { chunkText, DEFAULT_MAX_CHARS, DEFAULT_OVERLAP_CHARS, DEFAULT_MIN_WORDS } from '../src/index.ts'

describe('chunkText', () => {
  it('declara los valores por defecto del corte', () => {
    expect(DEFAULT_MAX_CHARS).toBe(1600)
    expect(DEFAULT_OVERLAP_CHARS).toBe(200)
    expect(DEFAULT_MIN_WORDS).toBe(4)
  })

  it('un texto corto es un solo trozo con sus posiciones', () => {
    const text = 'Un parrafo corto que cabe entero en un trozo.'
    expect(chunkText(text)).toEqual([{ id: 'chunk-0', text, start: 0, end: text.length }])
  })

  it('un texto sin contenido utilizable no produce trozos', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n\n  \t ')).toEqual([])
  })

  it('una sola palabra sigue siendo un trozo: no hay anterior con el que fundirla', () => {
    expect(chunkText('uno')).toEqual([{ id: 'chunk-0', text: 'uno', start: 0, end: 3 }])
  })

  it('sin parrafos corta por caracteres con solape', () => {
    const text = Array.from({ length: 1000 }, (_value, index) => String.fromCharCode(97 + (index % 26))).join('')
    const chunks = chunkText(text, { maxChars: 400, overlapChars: 100 })

    expect(chunks.map(chunk => [chunk.start, chunk.end])).toEqual([[0, 400], [300, 700], [600, 1000]])
    for (const chunk of chunks) expect(chunk.text).toBe(text.slice(chunk.start, chunk.end))
    // El solape repite la frontera (100 caracteres), no el contenido: los tres
    // trozos son distintos y juntos reconstruyen el texto una sola vez.
    expect(chunks[1]!.start).toBe(chunks[0]!.end - 100)
    expect(new Set(chunks.map(chunk => chunk.text)).size).toBe(3)
  })

  it('subdivide un parrafo mas largo que el maximo y respeta al que le sigue', () => {
    const long = 'a'.repeat(900)
    const text = `${long}\n\ncola con cuatro palabras`
    const chunks = chunkText(text, { maxChars: 400, overlapChars: 100 })

    expect(chunks.map(chunk => [chunk.start, chunk.end])).toEqual([[0, 400], [300, 700], [600, 900], [902, 926]])
    expect(chunks[3]!.text).toBe('cola con cuatro palabras')
  })

  it('funde una cola por debajo del suelo en el trozo anterior en vez de perderla', () => {
    const long = 'b'.repeat(700)
    const text = `${long}\n\nfin`
    const chunks = chunkText(text, { maxChars: 400, overlapChars: 100, minWords: 4 })

    expect(chunks).toHaveLength(2)
    expect(chunks[1]!.end).toBe(text.length)
    expect(chunks[1]!.text.endsWith('fin')).toBe(true)
  })

  it('funde parrafos que caben juntos', () => {
    const text = 'uno dos\n\ntres cuatro'
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.text).toBe(text)
  })

  it('separa parrafos que no caben juntos', () => {
    const first = 'a'.repeat(300)
    const second = 'b'.repeat(300)
    const chunks = chunkText(`${first}\n\n${second}`, { maxChars: 400, overlapChars: 50, minWords: 1 })

    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.text).toBe(first)
    expect(chunks[1]!.text).toBe(second)
  })

  it('trocea un documento realista de varias secciones sin perder contenido', () => {
    const text = [
      '# Guia de recuperacion',
      '',
      'Intro con varias palabras para que el trozo no se funda con nada.',
      '',
      '## Seccion larga',
      '',
      'y'.repeat(2000),
      '',
      'Cierre con cinco palabras mas.',
    ].join('\n')
    const chunks = chunkText(text, { maxChars: 500, overlapChars: 50 })

    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks.map(chunk => chunk.id)).toEqual(chunks.map((_chunk, index) => `chunk-${index}`))
    for (const chunk of chunks) expect(chunk.text).toBe(text.slice(chunk.start, chunk.end))
    expect(chunks[0]!.start).toBe(0)
    expect(chunks.at(-1)!.end).toBe(text.length)
    // Los offsets solo avanzan: los trozos citan el documento en orden.
    for (const [index, chunk] of chunks.entries()) {
      if (index > 0) expect(chunk.start).toBeGreaterThanOrEqual(chunks[index - 1]!.start)
    }
  })
})
