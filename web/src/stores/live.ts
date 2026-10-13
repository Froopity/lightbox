// What the board is showing: the active preset (or editor draft) and the live rate/brightness.
// Every change is sent; while offline it is dropped and the resend on connect covers it.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Command } from '../protocol/commands'
import { clonePreset, presetCommand, styleDefaults, toWire, type PresetData } from '../presets/preset'
import { styleByKey } from '../styles/registry'
import { useConnectionStore } from './connection'
import { useGlobalStore } from './global'

export const useLiveStore = defineStore('live', () => {
  /** The selected preset, or null (nothing selected, or a new preset being drafted). Not persisted. */
  const activeId = ref<string | null>(null)
  /** The settings on the board; `rate`/`brightness` are the live values. */
  const current = ref<PresetData>(styleDefaults())

  const send = (cmd: Command): void => useConnectionStore().send(cmd)

  /** Loads settings onto the board (`P`): resets the effect and the live values. */
  function show(p: PresetData, id: string | null): void {
    current.value = clonePreset(p)
    activeId.value = id
    send(presetCommand(current.value))
  }

  function setRate(v: number): void {
    current.value.rate = v
    send({ type: 'R', rate: toWire(v) })
  }

  function setBrightness(v: number): void {
    current.value.brightness = v
    send({ type: 'B', brightness: toWire(v) })
  }

  function setColor(slot: number, color: string): void {
    current.value.colors[slot] = color
    send({ type: 'C', slot, color })
  }

  function setParam(key: string, value: number): void {
    const idx = styleByKey(current.value.style)?.params.findIndex((p) => p.key === key) ?? -1
    if (idx < 0) return
    current.value.params[key] = value
    send({ type: 'A', idx, value })
  }

  /** Restores a freshly reset board: P, then G (then L once the LFO exists). */
  function resyncCommands(): Command[] {
    return [presetCommand(current.value), useGlobalStore().command()]
  }

  return { activeId, current, show, setRate, setBrightness, setColor, setParam, resyncCommands }
})
