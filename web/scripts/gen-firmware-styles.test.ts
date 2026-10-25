import { describe, expect, it } from 'vitest'
import { render, type StyleSpec } from './gen-firmware-styles'

const alarm: StyleSpec = {
  id: 0,
  key: 'alarm',
  name: 'Alarm',
  colors: 1,
  periodSlowMs: 2000,
  periodFastMs: 300,
  bMin: 4,
  bMax: 255,
  defaultColors: ['#FF0000'],
  params: [{ key: 'tail', label: 'Tail', wireMin: 0, wireMax: 16, default: 8, scale: 0.5 }],
}

describe('gen-firmware-styles', () => {
  it('renders an empty registry without a zero-length array', () => {
    const out = render([])
    expect(out).toContain('STYLE_COUNT = 0;')
    expect(out).not.toContain('STYLES[')
  })

  it('renders a style row with padded colours and params', () => {
    const out = render([alarm])
    expect(out).toContain('STYLE_ALARM = 0,')
    expect(out).toContain('{0, 1, 2000, 300, 4, 255, 1, {0xFF0000, 0x000000}, {{0, 16, 8}, {0, 0, 0}, {0, 0, 0}, {0, 0, 0}, {0, 0, 0}}},')
  })

  it('rejects ids that do not match their index', () => {
    expect(() => render([{ ...alarm, id: 1 }])).toThrow(/must equal its index/)
  })

  it('needs one dropdown option per wire value', () => {
    const shape = { key: 'shape', label: 'Shape', wireMin: 0, wireMax: 2, default: 0, scale: 1 }
    expect(() => render([{ ...alarm, params: [{ ...shape, options: ['A', 'B', 'C'] }] }])).not.toThrow()
    expect(() => render([{ ...alarm, params: [{ ...shape, options: ['A', 'B'] }] }])).toThrow(/one option per wire value/)
  })
})
