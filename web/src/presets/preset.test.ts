import { describe, expect, it } from 'vitest'
import { encode } from '../protocol/commands'
import { STYLES } from '../styles/registry'
import {
  exportDocument,
  exportFilename,
  parseImport,
  parseStored,
  presetCommand,
  repairList,
  repairPreset,
  samePresetData,
  seedPresets,
  storedDocument,
  styleDefaults,
} from './preset'

const alarm = { id: 'a', name: 'Red', style: 'alarm', colors: ['#ff0000'], rate: 0.25, brightness: 1, params: { tail: 4 } }

describe('seedPresets', () => {
  it('has one preset per style at its defaults', () => {
    const seeded = seedPresets()
    expect(seeded.map((p) => p.style)).toEqual(STYLES.map((s) => s.key))
    expect(seeded.map((p) => p.name)).toEqual(STYLES.map((s) => s.name))
    expect(new Set(seeded.map((p) => p.id)).size).toBe(seeded.length)
    expect(seeded[1]).toMatchObject({ colors: ['#FF0000'], rate: 0.5, brightness: 0.8, params: { tail: 0 } })
    expect(seeded[2]).toMatchObject({ name: 'Two-tone Glow', colors: ['#FF4000', '#8000FF'], params: {} })
    expect(seeded[4]).toMatchObject({ name: 'Lighthouse', params: { whip: 60, flash: 50, width: 5, front: 0 } })
  })

  it('seeds only the listed styles, in registry order', () => {
    expect(seedPresets(['lighthouse', 'twotone']).map((p) => p.style)).toEqual(['twotone', 'lighthouse'])
  })
})

describe('repairPreset', () => {
  it('keeps a valid preset, normalising colour case', () => {
    expect(repairPreset(alarm)).toEqual({ ...alarm, colors: ['#FF0000'] })
  })

  it.each([null, 3, 'x', [], {}, { style: 'nope' }, { style: 7 }])('rejects %j', (raw) => {
    expect(repairPreset(raw)).toBeNull()
  })

  it('repairs bad fields from the style defaults', () => {
    const p = repairPreset({ style: 'alarm', name: 5, colors: ['red', '#00ff00'], rate: 'fast', brightness: NaN, params: { tail: 'x', bogus: 3 } })
    expect(p).toMatchObject({ name: 'Alarm', colors: ['#FF0000'], rate: 0.5, brightness: 0.8, params: { tail: 0 } })
    expect(p?.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('clamps numbers into range and fits colours to the style', () => {
    const p = repairPreset({ ...alarm, name: '  Long '.padEnd(80, 'x'), rate: -1, brightness: 9, colors: ['#123456', '#654321'], params: { tail: 99.6 } })
    expect(p).toMatchObject({ rate: 0, brightness: 1, colors: ['#123456'], params: { tail: 16 } })
    expect(p?.name).toHaveLength(40)
    expect(p?.name.startsWith('Long')).toBe(true)
    expect(repairPreset({ ...alarm, params: { tail: -3 } })?.params).toEqual({ tail: 0 })
    expect(repairPreset({ ...alarm, params: { tail: 2.4 } })?.params).toEqual({ tail: 2 })
  })

  it('fills missing colours and params', () => {
    expect(repairPreset({ style: 'alarm' })).toMatchObject({ colors: ['#FF0000'], params: { tail: 0 } })
  })
})

describe('repairList', () => {
  it('drops broken entries and re-ids duplicates', () => {
    const list = repairList([alarm, 'junk', alarm, { style: 'ominous', id: 'o' }])
    expect(list.map((p) => p.style)).toEqual(['alarm', 'alarm', 'ominous'])
    expect(list[0]?.id).toBe('a')
    expect(list[1]?.id).not.toBe('a')
  })
})

describe('storage document', () => {
  it('round-trips', () => {
    const presets = seedPresets()
    expect(parseStored(storedDocument(presets, ['alarm', 'future']))).toEqual({ presets, seeded: ['alarm', 'future'] })
  })

  it('treats a document without `seeded` as having seeded the Phase 3 styles', () => {
    expect(parseStored(JSON.stringify({ version: 1, presets: [] }))?.seeded).toEqual(['ominous', 'alarm'])
  })

  it.each([null, '', 'not json', '[]', '{"version":2,"presets":[]}', '{"version":1}'])('reads %j as missing', (text) => {
    expect(parseStored(text)).toBeNull()
  })

  it('repairs entries inside a valid document', () => {
    expect(parseStored(JSON.stringify({ version: 1, presets: [alarm, 42] }))?.presets).toHaveLength(1)
  })
})

describe('export / import', () => {
  it('names the file by date', () => {
    expect(exportFilename(new Date(2026, 9, 3, 23, 59))).toBe('lightbox-presets-20261003.json')
  })

  it('round-trips through an export file', () => {
    const presets = seedPresets()
    const text = JSON.stringify(exportDocument(presets, new Date('2026-10-13T00:00:00Z')))
    expect(JSON.parse(text)).toMatchObject({ app: 'lightbox', version: 1, exportedAt: '2026-10-13T00:00:00.000Z' })
    expect(parseImport(text)).toEqual({ presets })
  })

  it.each([
    ['not json', /not valid JSON/],
    ['{"presets":[]}', /not a Lightbox preset export/],
    ['{"app":"other","version":1,"presets":[]}', /not a Lightbox preset export/],
    ['{"app":"lightbox","version":2,"presets":[]}', /Unsupported export version 2/],
    ['{"app":"lightbox","version":1,"presets":[1,{"style":"x"}]}', /no usable presets/],
  ])('rejects %s', (text, error) => {
    const r = parseImport(text)
    expect('error' in r && r.error).toMatch(error)
  })
})

describe('presetCommand', () => {
  it('encodes a preset as an atomic load', () => {
    expect(presetCommand(alarm)).toEqual({ type: 'P', style: 1, rate: 250, brightness: 1000, colors: ['#ff0000'], params: [4] })
    expect(encode(presetCommand(alarm)).split('*')[0]).toBe('P 1 250 1000 FF0000 000000 4 0 0 0')
  })

  it('rounds normalised values to wire units', () => {
    expect(presetCommand({ ...styleDefaults(), rate: 0.1234, brightness: 0.9996 })).toMatchObject({ rate: 123, brightness: 1000 })
  })
})

describe('samePresetData', () => {
  it('compares every field', () => {
    const a = styleDefaults()
    expect(samePresetData(a, styleDefaults())).toBe(true)
    expect(samePresetData(a, { ...a, name: 'x' })).toBe(false)
    expect(samePresetData(a, { ...a, colors: ['#000000'] })).toBe(false)
    expect(samePresetData(a, { ...a, params: { x: 1 } })).toBe(false)
  })
})
