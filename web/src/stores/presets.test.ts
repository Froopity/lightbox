import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { seedPresets, storedDocument, styleDefaults } from '../presets/preset'
import { STYLES } from '../styles/registry'
import { PRESETS_KEY, usePresetsStore } from './presets'

const stored = () => JSON.parse(localStorage.getItem(PRESETS_KEY) ?? 'null') as { version: number; presets: { name: string }[] }
const names = (s: ReturnType<typeof usePresetsStore>) => s.presets.map((p) => p.name)

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('presets store', () => {
  it('seeds one preset per style on first run and stores them', () => {
    const s = usePresetsStore()
    expect(names(s)).toEqual(STYLES.map((st) => st.name))
    expect(stored()).toEqual({ version: 1, presets: s.presets })
  })

  it('loads what is stored', () => {
    const presets = seedPresets().slice(0, 1)
    localStorage.setItem(PRESETS_KEY, storedDocument(presets))
    expect(usePresetsStore().presets).toEqual(presets)
  })

  it('keeps an empty list (no reseed)', () => {
    localStorage.setItem(PRESETS_KEY, storedDocument([]))
    expect(usePresetsStore().presets).toEqual([])
  })

  it('falls back to the seed without overwriting a corrupt document', () => {
    localStorage.setItem(PRESETS_KEY, '{oops')
    expect(usePresetsStore().presets).toHaveLength(STYLES.length)
    expect(localStorage.getItem(PRESETS_KEY)).toBe('{oops')
  })

  it('repairs entries without crashing', () => {
    localStorage.setItem(PRESETS_KEY, JSON.stringify({ version: 1, presets: [{ style: 'alarm', rate: 7 }, null, { style: '??' }] }))
    expect(usePresetsStore().presets).toMatchObject([{ name: 'Alarm', style: 'alarm', rate: 1 }])
  })

  it('adds at the end or after a preset, with a new id', () => {
    const s = usePresetsStore()
    const [first] = s.presets
    const a = s.add({ ...styleDefaults(), name: 'End' })
    const b = s.add({ ...styleDefaults(), name: 'Second' }, first?.id)
    expect(names(s)).toEqual(['Ominous Glow', 'Second', 'Alarm', 'End'])
    expect(a.id).not.toBe(b.id)
    expect(stored().presets.map((p) => p.name)).toEqual(names(s))
  })

  it('updates, removes and moves', () => {
    const s = usePresetsStore()
    const [o, a] = s.presets.map((p) => p.id)
    if (!o || !a) throw new Error('seed')
    s.update(o, { ...styleDefaults(), name: 'Glow' })
    expect(s.byId(o)?.name).toBe('Glow')
    s.move(0, 1)
    expect(names(s)).toEqual(['Alarm', 'Glow'])
    s.move(0, 5) // out of range: ignored
    expect(names(s)).toEqual(['Alarm', 'Glow'])
    s.remove(a)
    expect(names(s)).toEqual(['Glow'])
    expect(stored().presets.map((p) => p.name)).toEqual(['Glow'])
  })

  it('does not share arrays with the data it was given', () => {
    const s = usePresetsStore()
    const data = styleDefaults()
    const p = s.add(data)
    data.colors[0] = '#000000'
    expect(s.byId(p.id)?.colors[0]).toBe('#9966CC')
  })

  it('merges imports with fresh ids and replaces on request', () => {
    const s = usePresetsStore()
    const imported = s.presets.map((p) => ({ ...p, name: `${p.name} 2` }))
    s.merge(imported)
    expect(names(s)).toEqual(['Ominous Glow', 'Alarm', 'Ominous Glow 2', 'Alarm 2'])
    expect(new Set(s.presets.map((p) => p.id)).size).toBe(4)
    s.replace(imported.slice(0, 1))
    expect(names(s)).toEqual(['Ominous Glow 2'])
    expect(stored().presets).toHaveLength(1)
  })
})
