// Global brightness (persisted) and blackout (never persisted), PLAN.md §5. Sent as `G`.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Command } from '../protocol/commands'
import { toWire } from '../presets/preset'
import { useConnectionStore } from './connection'

export const GLOBAL_KEY = 'lightbox.global.v1'

function readLevel(): number {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(GLOBAL_KEY) ?? 'null')
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
  } catch {
    return 1
  }
}

export const useGlobalStore = defineStore('global', () => {
  /** Slider value, 0..1. */
  const level = ref(readLevel())
  const blackout = ref(false)
  /** What the board gets: 0 during blackout, else the slider. */
  const wire = computed(() => (blackout.value ? 0 : toWire(level.value)))

  function command(): Command {
    return { type: 'G', global: wire.value }
  }

  function setLevel(v: number): void {
    level.value = Math.min(1, Math.max(0, v))
    try {
      localStorage.setItem(GLOBAL_KEY, JSON.stringify(level.value))
    } catch {
      // storage unavailable
    }
    if (!blackout.value) useConnectionStore().send(command())
  }

  function toggleBlackout(): void {
    blackout.value = !blackout.value
    useConnectionStore().send(command())
  }

  return { level, blackout, wire, command, setLevel, toggleBlackout }
})
