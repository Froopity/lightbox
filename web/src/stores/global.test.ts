import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { recordSent } from '../testing/sent'
import { GLOBAL_KEY, useGlobalStore } from './global'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('global store', () => {
  it('defaults to 100%', () => {
    expect(useGlobalStore().command()).toEqual({ type: 'G', global: 1000 })
  })

  it('sends and persists the level', () => {
    const sent = recordSent()
    const g = useGlobalStore()
    g.setLevel(0.25)
    expect(sent).toEqual([{ type: 'G', global: 250 }])
    expect(localStorage.getItem(GLOBAL_KEY)).toBe('0.25')
    setActivePinia(createPinia())
    expect(useGlobalStore().level).toBe(0.25)
  })

  it.each(['"x"', '{', 'null', '7'])('reads %s from storage safely', (v) => {
    localStorage.setItem(GLOBAL_KEY, v)
    expect(useGlobalStore().level).toBe(1) // 7 is clamped
  })

  it('blackout sends 0 without touching the slider, and restores it', () => {
    const sent = recordSent()
    const g = useGlobalStore()
    g.setLevel(0.6)
    g.toggleBlackout()
    expect(g.blackout).toBe(true)
    expect(g.level).toBe(0.6)
    expect(g.command()).toEqual({ type: 'G', global: 0 })
    g.setLevel(0.4) // moves the slider, the board stays dark
    g.toggleBlackout()
    expect(sent).toEqual([
      { type: 'G', global: 600 },
      { type: 'G', global: 0 },
      { type: 'G', global: 400 },
    ])
  })

  it('never persists blackout', () => {
    useGlobalStore().toggleBlackout()
    setActivePinia(createPinia())
    expect(useGlobalStore().blackout).toBe(false)
  })
})
