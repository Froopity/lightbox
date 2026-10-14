// LFO (PLAN.md §5, §6): runs on the board and moves the live rate or brightness. Sent as `L`.
// The settings persist; the on/off state doesn't: it starts off, and every preset load (`P`) turns it off.
// While it's off, setting changes are only stored; they go out with the next `L`.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { LFO_MHZ_MAX, LFO_MHZ_MIN, type Command } from '../protocol/commands'
import { toWire } from '../presets/preset'
import { useConnectionStore } from './connection'

export const LFO_KEY = 'lightbox.lfo.v1'

export type LfoDestination = 'rate' | 'brightness'

export const HZ_MIN = LFO_MHZ_MIN / 1000
export const HZ_MAX = LFO_MHZ_MAX / 1000

/** The rate slider is log-scaled: position 0..1 → 0.05..5 Hz, rounded to the wire's millihertz. */
export function hzFromPosition(u: number): number {
  const hz = HZ_MIN * (HZ_MAX / HZ_MIN) ** Math.min(1, Math.max(0, u))
  return Math.round(hz * 1000) / 1000
}

export function positionFromHz(hz: number): number {
  return Math.log(hz / HZ_MIN) / Math.log(HZ_MAX / HZ_MIN)
}

interface Settings {
  target: LfoDestination
  hz: number
  /** 0..1: 1 swings the target over its full range, peak to peak. */
  depth: number
}

const DEFAULTS: Settings = { target: 'brightness', hz: 1, depth: 0.5 }

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function readSettings(): Settings {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LFO_KEY) ?? 'null')
    if (typeof v !== 'object' || v === null) return { ...DEFAULTS }
    const s = v as Partial<Record<keyof Settings, unknown>>
    const num = (x: unknown, lo: number, hi: number, d: number): number =>
      typeof x === 'number' && Number.isFinite(x) ? clamp(x, lo, hi) : d
    return {
      target: s.target === 'rate' || s.target === 'brightness' ? s.target : DEFAULTS.target,
      hz: num(s.hz, HZ_MIN, HZ_MAX, DEFAULTS.hz),
      depth: num(s.depth, 0, 1, DEFAULTS.depth),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export const useLfoStore = defineStore('lfo', () => {
  const initial = readSettings()
  const on = ref(false)
  const target = ref<LfoDestination>(initial.target)
  const hz = ref(initial.hz)
  const depth = ref(initial.depth)

  function command(): Command {
    return {
      type: 'L',
      on: on.value ? 1 : 0,
      target: target.value === 'rate' ? 0 : 1,
      mHz: clamp(Math.round(hz.value * 1000), LFO_MHZ_MIN, LFO_MHZ_MAX),
      depth: toWire(depth.value),
    }
  }

  function save(): void {
    try {
      localStorage.setItem(LFO_KEY, JSON.stringify({ target: target.value, hz: hz.value, depth: depth.value }))
    } catch {
      // storage unavailable
    }
  }

  /** Stores a setting change and, while running, sends it (the board keeps its phase). */
  function changed(): void {
    save()
    if (on.value) useConnectionStore().send(command())
  }

  function setOn(v: boolean): void {
    if (on.value === v) return
    on.value = v
    useConnectionStore().send(command())
  }

  function setTarget(v: LfoDestination): void {
    target.value = v
    changed()
  }

  function setHz(v: number): void {
    hz.value = clamp(v, HZ_MIN, HZ_MAX)
    changed()
  }

  function setDepth(v: number): void {
    depth.value = clamp(v, 0, 1)
    changed()
  }

  /** A preset load (`P`) has turned it off on the board; nothing to send. */
  function stopped(): void {
    on.value = false
  }

  /** After a reconnect's `P` (which turns it off): `L` only if it should be running. */
  function resyncCommands(): Command[] {
    return on.value ? [command()] : []
  }

  return { on, target, hz, depth, command, setOn, setTarget, setHz, setDepth, stopped, resyncCommands }
})
