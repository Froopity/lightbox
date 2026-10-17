import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Command } from '../protocol/commands'
import { styleDefaults } from '../presets/preset'
import { recordSent } from '../testing/sent'
import { useEditorStore } from './editor'
import { HZ_MAX, HZ_MIN, hzFromPosition, LFO_KEY, positionFromHz, useLfoStore } from './lfo'
import { useLiveStore } from './live'
import { usePresetsStore } from './presets'

let sent: Command[]

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  sent = recordSent()
})

describe('lfo store', () => {
  it('starts off with default settings', () => {
    const lfo = useLfoStore()
    expect(lfo.on).toBe(false)
    expect(lfo.command()).toEqual({ type: 'L', on: 0, target: 1, mHz: 1000, depth: 500 })
    expect(lfo.resyncCommands()).toEqual([])
  })

  it('enabling and disabling send L with the current settings', () => {
    const lfo = useLfoStore()
    lfo.setOn(true)
    lfo.setOn(true) // no change, nothing sent
    lfo.setOn(false)
    expect(sent).toEqual([
      { type: 'L', on: 1, target: 1, mHz: 1000, depth: 500 },
      { type: 'L', on: 0, target: 1, mHz: 1000, depth: 500 },
    ])
  })

  it('setting changes are sent only while running', () => {
    const lfo = useLfoStore()
    lfo.setTarget('rate')
    lfo.setHz(2.5)
    lfo.setDepth(0.25)
    expect(sent).toEqual([])
    lfo.setOn(true)
    lfo.setDepth(1)
    lfo.setTarget('brightness')
    expect(sent).toEqual([
      { type: 'L', on: 1, target: 0, mHz: 2500, depth: 250 },
      { type: 'L', on: 1, target: 0, mHz: 2500, depth: 1000 },
      { type: 'L', on: 1, target: 1, mHz: 2500, depth: 1000 },
    ])
  })

  it('clamps to 0.01–5 Hz and depth 0..1', () => {
    const lfo = useLfoStore()
    lfo.setHz(0.001)
    lfo.setDepth(-1)
    expect(lfo.command()).toMatchObject({ mHz: 10, depth: 0 })
    lfo.setHz(99)
    lfo.setDepth(3)
    expect(lfo.command()).toMatchObject({ mHz: 5000, depth: 1000 })
  })

  it('persists the settings but not the on/off state', () => {
    const lfo = useLfoStore()
    lfo.setTarget('rate')
    lfo.setHz(0.2)
    lfo.setDepth(0.8)
    lfo.setOn(true)
    setActivePinia(createPinia())
    const again = useLfoStore()
    expect(again.on).toBe(false)
    expect({ target: again.target, hz: again.hz, depth: again.depth }).toEqual({ target: 'rate', hz: 0.2, depth: 0.8 })
  })

  it.each(['"x"', '{', 'null', '7', '{"target":"up","hz":"fast","depth":null}'])('reads %s from storage safely', (v) => {
    localStorage.setItem(LFO_KEY, v)
    const lfo = useLfoStore()
    expect({ target: lfo.target, hz: lfo.hz, depth: lfo.depth }).toEqual({ target: 'brightness', hz: 1, depth: 0.5 })
  })

  it('clamps stored values that are out of range', () => {
    localStorage.setItem(LFO_KEY, JSON.stringify({ target: 'rate', hz: 50, depth: -2 }))
    const lfo = useLfoStore()
    expect({ target: lfo.target, hz: lfo.hz, depth: lfo.depth }).toEqual({ target: 'rate', hz: 5, depth: 0 })
  })

  it('the rate slider is log-scaled over 0.01–5 Hz', () => {
    expect(hzFromPosition(0)).toBe(HZ_MIN)
    expect(hzFromPosition(1)).toBe(HZ_MAX)
    expect(hzFromPosition(0.5)).toBe(0.224) // the geometric midpoint, √(0.01·5)
    expect(hzFromPosition(-1)).toBe(HZ_MIN)
    expect(positionFromHz(Math.sqrt(0.05))).toBeCloseTo(0.5)
    for (const hz of [0.01, 0.05, 0.123, 1, 4.2, 5]) expect(hzFromPosition(positionFromHz(hz))).toBe(hz)
  })
})

describe('lfo and presets', () => {
  it('loading a preset turns it off without sending L (P does it on the board)', async () => {
    const lfo = useLfoStore()
    const presets = usePresetsStore()
    const [a, b] = presets.presets
    if (!a || !b) throw new Error('seed')
    await useEditorStore().select(a.id)
    lfo.setOn(true)
    sent.length = 0
    await useEditorStore().select(b.id)
    expect(lfo.on).toBe(false)
    expect(sent.map((c) => c.type)).toEqual(['P'])
  })

  it('opening the editor and ↻ turn it off too', async () => {
    const lfo = useLfoStore()
    const editor = useEditorStore()
    const [a] = usePresetsStore().presets
    if (!a) throw new Error('seed')
    await editor.select(a.id)
    lfo.setOn(true)
    await editor.reload(a.id)
    expect(lfo.on).toBe(false)
    lfo.setOn(true)
    await editor.edit(a.id)
    expect(lfo.on).toBe(false)
  })

  it('the reconnect resend ends with L only while it runs', () => {
    const live = useLiveStore()
    const lfo = useLfoStore()
    live.show(styleDefaults(), null)
    expect(live.resyncCommands().map((c) => c.type)).toEqual(['P', 'G'])
    lfo.setOn(true)
    expect(live.resyncCommands().map((c) => c.type)).toEqual(['P', 'G', 'L'])
    expect(live.resyncCommands()[2]).toEqual(lfo.command())
  })
})
