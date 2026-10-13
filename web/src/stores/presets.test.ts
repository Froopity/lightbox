import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { seedPresets, storedDocument, styleDefaults } from '../presets/preset'
import { STYLES } from '../styles/registry'
import { PRESETS_KEY, usePresetsStore } from './presets'

const stored = () =>
  JSON.parse(localStorage.getItem(PRESETS_KEY) ?? 'null') as { version: number; presets: { name: string }[]; seeded: string[] }
const names = (s: ReturnType<typeof usePresetsStore>) => s.presets.map((p) => p.name)
const allKeys = STYLES.map((st) => st.key)
/** A store over a saved list with just the Ominous and Alarm defaults. */
const twoPresets = () => {
  localStorage.setItem(PRESETS_KEY, storedDocument(seedPresets(['ominous', 'alarm'])))
  return usePresetsStore()
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('presets store', () => {
  it('seeds one preset per style on first run and stores them', () => {
    const s = usePresetsStore()
    expect(names(s)).toEqual(STYLES.map((st) => st.name))
    expect(stored()).toEqual({ version: 1, presets: s.presets, seeded: allKeys })
  })

  it('seeds styles added since the list was saved, once, at the end', () => {
    // A Phase 3 document: no `seeded`, so Ominous and Alarm count as seeded. The user deleted Ominous.
    const [, alarm] = seedPresets()
    localStorage.setItem(PRESETS_KEY, JSON.stringify({ version: 1, presets: [{ ...alarm, name: 'Mine' }] }))
    const s = usePresetsStore()
    expect(names(s)).toEqual(['Mine', 'Two-tone Glow', 'Vertical Pulse', 'Lighthouse'])
    expect(stored().seeded).toEqual(allKeys)
    expect(stored().presets.map((p) => p.name)).toEqual(names(s))

    const pulse = s.presets.find((p) => p.style === 'pulse')
    if (!pulse) throw new Error('seed')
    s.remove(pulse.id)
    setActivePinia(createPinia())
    expect(names(usePresetsStore())).toEqual(['Mine', 'Two-tone Glow', 'Lighthouse'])
  })

  it('does not rewrite the document when nothing new was seeded', () => {
    const text = storedDocument(seedPresets(['alarm']), ['ominous', 'alarm', 'twotone', 'pulse', 'lighthouse', 'future'])
    localStorage.setItem(PRESETS_KEY, text)
    expect(names(usePresetsStore())).toEqual(['Alarm'])
    expect(localStorage.getItem(PRESETS_KEY)).toBe(text)
  })

  it('keeps seeded keys it does not know when it writes', () => {
    localStorage.setItem(PRESETS_KEY, storedDocument([], ['ominous', 'alarm', 'future']))
    usePresetsStore()
    expect(stored().seeded).toEqual(['ominous', 'alarm', 'future', 'twotone', 'pulse', 'lighthouse'])
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
    localStorage.setItem(
      PRESETS_KEY,
      JSON.stringify({ version: 1, presets: [{ style: 'alarm', rate: 7 }, null, { style: '??' }], seeded: allKeys }),
    )
    expect(usePresetsStore().presets).toMatchObject([{ name: 'Alarm', style: 'alarm', rate: 1 }])
  })

  it('adds at the end or after a preset, with a new id', () => {
    const s = twoPresets()
    const [first] = s.presets
    const a = s.add({ ...styleDefaults(), name: 'End' })
    const b = s.add({ ...styleDefaults(), name: 'Second' }, first?.id)
    expect(names(s)).toEqual(['Ominous Glow', 'Second', 'Alarm', 'End'])
    expect(a.id).not.toBe(b.id)
    expect(stored().presets.map((p) => p.name)).toEqual(names(s))
  })

  it('updates, removes and moves', () => {
    const s = twoPresets()
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
    const s = twoPresets()
    const imported = s.presets.map((p) => ({ ...p, name: `${p.name} 2` }))
    s.merge(imported)
    expect(names(s)).toEqual(['Ominous Glow', 'Alarm', 'Ominous Glow 2', 'Alarm 2'])
    expect(new Set(s.presets.map((p) => p.id)).size).toBe(4)
    s.replace(imported.slice(0, 1))
    expect(names(s)).toEqual(['Ominous Glow 2'])
    expect(stored().presets).toHaveLength(1)
  })
})
