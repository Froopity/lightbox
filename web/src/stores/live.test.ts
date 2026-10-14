import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Command } from '../protocol/commands'
import { recordSent } from '../testing/sent'
import { useEditorStore } from './editor'
import { useLiveStore } from './live'
import { usePresetsStore } from './presets'

let sent: Command[]

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  sent = recordSent()
})

const stored = () => localStorage.getItem('lightbox.presets.v1')

/** The first two seeded presets. */
function seeded() {
  const presets = usePresetsStore()
  const [a, b] = presets.presets
  if (!a || !b) throw new Error('seed')
  return { presets, a, b }
}

describe('live store', () => {
  it('live rate/brightness are sent and never touch the stored preset', async () => {
    const { presets, a, b } = seeded()
    const live = useLiveStore()
    const editor = useEditorStore()
    await editor.select(b.id)
    await editor.select(a.id)
    const before = { list: JSON.stringify(presets.presets), doc: stored() }
    sent.length = 0
    live.setRate(0.9)
    live.setBrightness(0.1)
    live.nudgeRate(0.05)
    expect(sent).toEqual([
      { type: 'R', rate: 900 },
      { type: 'B', brightness: 100 },
      { type: 'R', rate: 950 },
    ])
    expect(live.current).toMatchObject({ rate: 0.95, brightness: 0.1 })
    expect(JSON.stringify(presets.presets)).toBe(before.list)
    expect(stored()).toBe(before.doc)
  })

  it('selecting a preset resets the live values to it', async () => {
    const { presets, a, b } = seeded()
    const live = useLiveStore()
    const editor = useEditorStore()
    presets.update(b.id, { ...b, rate: 0.2, brightness: 0.3 })
    await editor.select(a.id)
    live.setRate(1)
    live.setBrightness(1)
    await editor.select(b.id)
    expect(live.current).toMatchObject({ rate: 0.2, brightness: 0.3 })
    expect(live.preset).toEqual({ rate: 0.2, brightness: 0.3 })
    expect(sent.at(-1)).toMatchObject({ type: 'P', rate: 200, brightness: 300 })
  })

  it('↻ returns each live value to the preset', () => {
    const live = useLiveStore()
    live.show({ ...live.current, rate: 0.25, brightness: 0.75 }, null)
    live.setRate(0.9)
    live.setBrightness(0.1)
    sent.length = 0
    live.resetRate()
    expect(live.current).toMatchObject({ rate: 0.25, brightness: 0.1 })
    live.resetBrightness()
    expect(live.current).toMatchObject({ rate: 0.25, brightness: 0.75 })
    expect(sent).toEqual([
      { type: 'R', rate: 250 },
      { type: 'B', brightness: 750 },
    ])
  })

  it('↻ returns to the draft value while editing', async () => {
    const live = useLiveStore()
    const editor = useEditorStore()
    await editor.edit(seeded().a.id)
    editor.setRate(0.3)
    live.setRate(0.8)
    expect(editor.draft?.rate).toBe(0.3) // live changes don't touch the draft either
    live.resetRate()
    expect(live.current.rate).toBe(0.3)
  })

  it('nudges clamp to 0..1 and stay on the 0.001 grid', () => {
    const live = useLiveStore()
    live.setRate(0.98)
    live.nudgeRate(0.05)
    expect(live.current.rate).toBe(1)
    live.setBrightness(0.1)
    for (let i = 0; i < 3; i++) live.nudgeBrightness(-0.01)
    expect(live.current.brightness).toBe(0.07)
    live.nudgeBrightness(-0.5)
    expect(live.current.brightness).toBe(0)
  })

  it('the resync after a reconnect keeps the live values', () => {
    const live = useLiveStore()
    live.setRate(0.9)
    expect(live.resyncCommands()[0]).toMatchObject({ type: 'P', rate: 900 })
  })
})
