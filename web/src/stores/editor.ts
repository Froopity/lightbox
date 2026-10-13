// The preset editor's draft and the actions that change which preset is active (PLAN.md §5 Rules).
// Edits are previewed live and stored only on Save; anything that would drop unsaved edits asks first.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { clonePreset, MAX_NAME, samePresetData, styleDefaults, type PresetData } from '../presets/preset'
import { styleByKey } from '../styles/registry'
import { useDialogStore } from './dialog'
import { useLiveStore } from './live'
import { usePresetsStore } from './presets'

export const useEditorStore = defineStore('editor', () => {
  /** The settings being edited; null when the editor is closed. */
  const draft = ref<PresetData | null>(null)
  /** The preset being edited, or null for a new one. */
  const editingId = ref<string | null>(null)
  /** The draft's starting point, to tell whether it has unsaved changes. */
  const base = ref<PresetData | null>(null)
  /** The preset that was active before `+`, reloaded if the new draft is discarded. */
  let returnTo: string | null = null

  const isOpen = computed(() => draft.value !== null)
  const isNew = computed(() => isOpen.value && editingId.value === null)
  const dirty = computed(() => !!draft.value && !!base.value && !samePresetData(draft.value, base.value))

  const presets = () => usePresetsStore()
  const live = () => useLiveStore()

  /** True when it's fine to drop the draft: nothing unsaved, or the user agreed. */
  async function confirmDiscard(): Promise<boolean> {
    return !dirty.value || (await useDialogStore().confirm('Discard unsaved changes?', 'Discard', 'danger'))
  }

  function close(): void {
    draft.value = base.value = null
    editingId.value = null
  }

  function begin(data: PresetData, id: string | null): void {
    draft.value = clonePreset(data)
    base.value = clonePreset(data)
    editingId.value = id
  }

  /** Makes a preset active (row click, radio, 1–9). Closes an editor open on another preset. */
  async function select(id: string): Promise<void> {
    const p = presets().byId(id)
    if (!p) return
    if (isOpen.value ? editingId.value === id : live().activeId === id) return
    if (!(await confirmDiscard())) return
    close()
    live().show(p, id)
  }

  /** Selects the preset at a list position (0-based), for the 1–9 shortcuts. */
  async function selectIndex(i: number): Promise<void> {
    const p = presets().presets[i]
    if (p) await select(p.id)
  }

  /** ↻ on the active row: reloads the saved preset onto the board (and into the editor if it's open on it). */
  async function reload(id: string): Promise<void> {
    const p = presets().byId(id)
    if (!p || !(await confirmDiscard())) return
    if (isOpen.value && editingId.value === id) begin(p, id)
    else close()
    live().show(p, id)
  }

  /** ✎: opens the editor on a preset and makes it active. */
  async function edit(id: string): Promise<void> {
    const p = presets().byId(id)
    if (!p || (isOpen.value && editingId.value === id)) return
    if (!(await confirmDiscard())) return
    begin(p, id)
    live().show(p, id)
  }

  /** `+`: a draft with the first style's defaults; it becomes a preset only when saved. */
  async function create(): Promise<void> {
    if (!(await confirmDiscard())) return
    if (!isNew.value) returnTo = live().activeId
    const d = styleDefaults()
    begin(d, null)
    live().show(d, null)
  }

  /** ✕: drops the draft and puts the saved preset (or, for a new one, the previous preset) back. */
  function discard(): void {
    if (!isOpen.value) return
    const id = isNew.value ? returnTo : editingId.value
    close()
    const p = presets().byId(id)
    if (p && id) live().show(p, id)
  }

  function save(): void {
    const d = draft.value
    if (!d) return
    const data = clonePreset(d)
    data.name = data.name.trim().slice(0, MAX_NAME) || (styleByKey(data.style)?.name ?? 'Preset')
    let id = editingId.value
    if (id === null) id = presets().add(data).id
    else presets().update(id, data)
    live().activeId = id
    close()
  }

  /** Saves the draft as a copy right after the original and keeps editing the copy. The original is unchanged. */
  function duplicate(): void {
    const d = draft.value
    const id = editingId.value
    if (!d || id === null) return
    const name = `${d.name.trim() || 'Preset'} copy`.slice(0, MAX_NAME)
    const copy = presets().add({ ...clonePreset(d), name }, id)
    begin(copy, copy.id)
    live().activeId = copy.id
  }

  async function remove(): Promise<void> {
    const id = editingId.value
    const p = presets().byId(id)
    if (!p || !id) return
    if (!(await useDialogStore().confirm(`Delete “${p.name}”?`, 'Delete', 'danger'))) return
    presets().remove(id)
    close()
    // The lights keep showing it; nothing is selected.
    if (live().activeId === id) live().activeId = null
  }

  // Field edits: the draft changes and the board previews it.

  function setName(name: string): void {
    if (draft.value) draft.value.name = name.slice(0, MAX_NAME)
  }

  /** A new style starts from its own defaults (colours, params); the name follows unless it was customised. */
  function setStyle(key: string): void {
    const d = draft.value
    const style = styleByKey(key)
    if (!d || !style || d.style === key) return
    const defaults = styleDefaults(style)
    const oldName = styleByKey(d.style)?.name
    draft.value = {
      ...defaults,
      name: d.name.trim() === '' || d.name === oldName ? defaults.name : d.name,
      rate: d.rate,
      brightness: d.brightness,
    }
    live().show(draft.value, editingId.value)
  }

  function setColor(slot: number, color: string): void {
    if (!draft.value) return
    const c = color.toUpperCase()
    draft.value.colors[slot] = c
    live().setColor(slot, c)
  }

  function setRate(v: number): void {
    if (!draft.value) return
    draft.value.rate = v
    live().setRate(v)
  }

  function setBrightness(v: number): void {
    if (!draft.value) return
    draft.value.brightness = v
    live().setBrightness(v)
  }

  function setParam(key: string, v: number): void {
    if (!draft.value) return
    draft.value.params[key] = v
    live().setParam(key, v)
  }

  return {
    draft,
    editingId,
    isOpen,
    isNew,
    dirty,
    confirmDiscard,
    close,
    select,
    selectIndex,
    reload,
    edit,
    create,
    discard,
    save,
    duplicate,
    remove,
    setName,
    setStyle,
    setColor,
    setRate,
    setBrightness,
    setParam,
  }
})
