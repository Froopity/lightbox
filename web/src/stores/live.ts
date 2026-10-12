// What the board should be showing. Phase 2: one style at its defaults (presets arrive in Phase 3).
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Command } from '../protocol/commands'
import { defaultParams, STYLES, styleById } from '../styles/registry'
import { DEFAULT_BRIGHTNESS, DEFAULT_GLOBAL, DEFAULT_RATE } from '../styles/types'
import { useConnectionStore } from './connection'

export const useLiveStore = defineStore('live', () => {
  const style = ref(STYLES[0]?.id ?? 0)

  function presetCommand(): Command {
    const s = styleById(style.value) ?? STYLES[0]
    if (!s) throw new Error('styles.json has no styles')
    return { type: 'P', style: s.id, rate: DEFAULT_RATE, brightness: DEFAULT_BRIGHTNESS, colors: s.defaultColors, params: defaultParams(s) }
  }

  /** Switches the board to a style with its default settings. */
  function selectStyle(id: number): void {
    style.value = id
    useConnectionStore().send(presetCommand())
  }

  function resyncCommands(): Command[] {
    return [presetCommand(), { type: 'G', global: DEFAULT_GLOBAL }]
  }

  return { style, selectStyle, resyncCommands }
})
