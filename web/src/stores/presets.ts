// The preset list, persisted in localStorage (PLAN.md §5). Seeded with one preset per style on first run.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { clonePreset, newId, parseStored, seedPresets, storedDocument, type Preset, type PresetData } from '../presets/preset'

export const PRESETS_KEY = 'lightbox.presets.v1'

function readStorage(): string | null {
  try {
    return localStorage.getItem(PRESETS_KEY)
  } catch {
    return null
  }
}

export const usePresetsStore = defineStore('presets', () => {
  const stored = readStorage()
  const loaded = parseStored(stored)
  const presets = ref<Preset[]>(loaded ?? seedPresets())
  // Seed on first run only. A corrupt document is left alone until the user changes something.
  if (stored === null) persist()

  function persist(): void {
    try {
      localStorage.setItem(PRESETS_KEY, storedDocument(presets.value))
    } catch {
      // storage full or disabled: the list still works for this session
    }
  }

  function byId(id: string | null): Preset | undefined {
    return id === null ? undefined : presets.value.find((p) => p.id === id)
  }

  function indexOf(id: string): number {
    return presets.value.findIndex((p) => p.id === id)
  }

  /** Adds a preset after `afterId` (or at the end) and returns it. */
  function add(data: PresetData, afterId?: string): Preset {
    const p: Preset = { ...clonePreset(data), id: newId() }
    const at = afterId === undefined ? -1 : indexOf(afterId)
    if (at < 0) presets.value.push(p)
    else presets.value.splice(at + 1, 0, p)
    persist()
    return p
  }

  function update(id: string, data: PresetData): void {
    const i = indexOf(id)
    if (i < 0) return
    presets.value[i] = { ...clonePreset(data), id }
    persist()
  }

  function remove(id: string): void {
    const i = indexOf(id)
    if (i < 0) return
    presets.value.splice(i, 1)
    persist()
  }

  /** Moves the preset at `from` to position `to`. */
  function move(from: number, to: number): void {
    const list = presets.value
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const [p] = list.splice(from, 1)
    if (p) list.splice(to, 0, p)
    persist()
  }

  /** Appends imported presets with fresh ids. */
  function merge(imported: Preset[]): void {
    presets.value.push(...imported.map((p) => ({ ...clonePreset(p), id: newId() })))
    persist()
  }

  function replace(imported: Preset[]): void {
    presets.value = imported.map(clonePreset)
    persist()
  }

  return { presets, byId, add, update, remove, move, merge, replace }
})
