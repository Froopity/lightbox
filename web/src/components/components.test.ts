import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import type { Command } from '../protocol/commands'
import { exportDocument, styleDefaults } from '../presets/preset'
import { useDialogStore } from '../stores/dialog'
import { useEditorStore } from '../stores/editor'
import { useGlobalStore } from '../stores/global'
import { useLiveStore } from '../stores/live'
import { usePresetsStore } from '../stores/presets'
import { recordSent } from '../testing/sent'
import AppDialog from './AppDialog.vue'
import GlobalBrightness from './GlobalBrightness.vue'
import PresetEditor from './PresetEditor.vue'
import PresetList from './PresetList.vue'
import PresetTransfer from './PresetTransfer.vue'
import ResetButton from './ResetButton.vue'
import { isTyping, useShortcuts } from '../composables/useShortcuts'

let sent: Command[]

enableAutoUnmount(afterEach)

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  sent = recordSent()
})
afterEach(() => {
  document.body.innerHTML = ''
})

const names = () => usePresetsStore().presets.map((p) => p.name)

describe('ResetButton', () => {
  it('is labelled and emits click', async () => {
    const w = mount(ResetButton, { props: { label: 'Reset rate' } })
    expect(w.attributes('aria-label')).toBe('Reset rate')
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })
})

describe('PresetList', () => {
  it('numbers the first nine rows', async () => {
    const presets = usePresetsStore()
    for (let i = 0; i < 9; i++) presets.add({ ...styleDefaults(), name: `P${i}` })
    const w = mount(PresetList)
    const badges = w.findAll('.badge').map((b) => b.text())
    expect(badges).toHaveLength(14)
    expect(badges.slice(0, 9)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(badges.slice(9)).toEqual(['', '', '', '', ''])
  })

  it('shows ↻ only on the active row, and it reloads the preset', async () => {
    const w = mount(PresetList)
    expect(w.findAll('.reset')).toHaveLength(0)
    await w.findAll('[role="radio"]')[1]?.trigger('click')
    await flushPromises()
    const rows = w.findAll('[data-testid="preset-row"]')
    expect(rows[1]?.find('.reset').exists()).toBe(true)
    expect(rows[0]?.find('.reset').exists()).toBe(false)
    sent.length = 0
    await rows[1]?.get('.reset').trigger('click')
    await flushPromises()
    expect(sent.map((c) => c.type)).toEqual(['P'])
  })

  it('✎ opens the editor and marks the row', async () => {
    const w = mount(PresetList)
    await w.get('[aria-label="Edit Alarm"]').trigger('click')
    await flushPromises()
    expect(useEditorStore().editingId).toBe(usePresetsStore().presets[1]?.id)
    expect(w.findAll('[data-testid="preset-row"]')[1]?.classes()).toContain('editing')
  })

  it('reorders with the keyboard on the handle', async () => {
    const w = mount(PresetList, { attachTo: document.body })
    await w.findAll('.handle')[0]?.trigger('keydown', { key: 'ArrowDown' })
    expect(names()).toEqual(['Alarm', 'Ominous Glow', 'Two-tone Glow', 'Vertical Pulse', 'Lighthouse'])
    await w.findAll('.handle')[0]?.trigger('keydown', { key: 'ArrowUp' }) // already at the top
    expect(names()).toEqual(['Alarm', 'Ominous Glow', 'Two-tone Glow', 'Vertical Pulse', 'Lighthouse'])
  })

  it('reorders by drag and drop', async () => {
    const w = mount(PresetList)
    const dataTransfer = { setData: () => undefined, setDragImage: () => undefined, effectAllowed: '' }
    await w.findAll('.handle')[1]?.trigger('dragstart', { dataTransfer })
    await w.findAll('[data-testid="preset-row"]')[0]?.trigger('dragover')
    await w.findAll('[data-testid="preset-row"]')[0]?.trigger('drop')
    expect(names()).toEqual(['Alarm', 'Ominous Glow', 'Two-tone Glow', 'Vertical Pulse', 'Lighthouse'])
  })

  it('+ opens a new draft', async () => {
    const w = mount(PresetList)
    await w.get('[aria-label="New preset"]').trigger('click')
    await flushPromises()
    expect(useEditorStore().isNew).toBe(true)
  })
})

describe('PresetEditor', () => {
  async function editAlarm() {
    const w = mount(PresetEditor)
    await useEditorStore().edit(usePresetsStore().presets[1]?.id ?? '')
    await flushPromises()
    sent.length = 0
    return w
  }

  it('shows a hint when closed', () => {
    expect(mount(PresetEditor).text()).toBe('✎ a preset or + to create one')
  })

  it('renders the style’s fields, params from the registry', async () => {
    const w = await editAlarm()
    expect((w.get('input[type="text"]').element as HTMLInputElement).value).toBe('Alarm')
    expect((w.get('select').element as HTMLSelectElement).value).toBe('alarm')
    expect(w.findAll('input[type="color"]')).toHaveLength(1)
    expect(w.text()).toContain('Colour')
    expect(w.findAll('.ends').map((e) => e.text())).toEqual(['slowfast', 'darkbright'])
    expect(w.text()).toContain('Tail')
    expect(w.get('output').text()).toBe('0 cols')
    expect(w.text()).toContain('Duplicate')
    expect(w.text()).toContain('Delete')
  })

  it('sends slider and param changes, showing wire × scale + unit', async () => {
    const w = await editAlarm()
    const ranges = w.findAll('input[type="range"]')
    await ranges[0]?.setValue('0.3')
    await ranges[2]?.setValue('5')
    expect(sent).toEqual([
      { type: 'R', rate: 300 },
      { type: 'A', idx: 0, value: 5 },
    ])
    expect(w.get('output').text()).toBe('2.5 cols')
    expect(w.text()).toContain('unsaved')
  })

  it('switching style re-renders its fields', async () => {
    const w = await editAlarm()
    await w.get('select').setValue('ominous')
    expect(w.text()).not.toContain('Tail')
    expect(sent.at(-1)).toMatchObject({ type: 'P', style: 0 })
  })

  it('picks up the Phase 4 styles from the registry', async () => {
    const w = await editAlarm()
    await w.get('select').setValue('twotone')
    expect(w.findAll('input[type="color"]').map((c) => (c.element as HTMLInputElement).value)).toEqual(['#ff4000', '#8000ff'])
    expect(sent.at(-1)).toMatchObject({ type: 'P', style: 2, colors: ['#FF4000', '#8000FF'] })

    await w.get('select').setValue('lighthouse')
    expect(w.findAll('output').map((o) => o.text())).toEqual(['0.6', '0.5', '5 cols', '0'])
    for (const label of ['Whip', 'Flash', 'Width', 'Front column']) expect(w.text()).toContain(label)
    expect(sent.at(-1)).toMatchObject({ type: 'P', style: 4, params: [60, 50, 5, 0] })
  })

  it('✕ discards', async () => {
    const w = await editAlarm()
    await w.get('[aria-label="Close editor and discard changes"]').trigger('click')
    expect(useEditorStore().isOpen).toBe(false)
  })

  it('has no Duplicate/Delete for a new preset', async () => {
    const w = mount(PresetEditor)
    await useEditorStore().create()
    await flushPromises()
    expect(w.text()).toContain('New preset')
    expect(w.text()).not.toContain('Duplicate')
  })
})

describe('GlobalBrightness', () => {
  it('is a vertical slider that sends G, with ↻ to 100%', async () => {
    const w = mount(GlobalBrightness)
    await w.get('input').setValue('0.5')
    expect(w.get('output').text()).toBe('50%')
    await w.get('.reset').trigger('click')
    expect(w.get('output').text()).toBe('100%')
    expect(sent).toEqual([
      { type: 'G', global: 500 },
      { type: 'G', global: 1000 },
    ])
  })
})

describe('AppDialog', () => {
  it('answers from its buttons and Esc', async () => {
    const w = mount(AppDialog, { attachTo: document.body })
    const dialog = useDialogStore()
    const p = dialog.confirm('Discard unsaved changes?', 'Discard', 'danger')
    await flushPromises()
    expect(w.get('[role="dialog"]').text()).toContain('Discard unsaved changes?')
    expect(document.activeElement?.textContent?.trim()).toBe('Discard')
    await w.get('button.danger').trigger('click')
    expect(await p).toBe(true)
    const q = dialog.confirm('Again?', 'Yes')
    await flushPromises()
    await w.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(await q).toBe(false)
  })
})

describe('PresetTransfer', () => {
  async function importText(text: string) {
    const w = mount(PresetTransfer)
    const input = w.get('[data-testid="import-file"]')
    Object.defineProperty(input.element, 'files', { value: [new File([text], 'presets.json')], configurable: true })
    await input.trigger('change')
    await flushPromises()
    return w
  }
  const exported = () => JSON.stringify(exportDocument([{ ...styleDefaults(), id: 'x', name: 'Imported' }]))

  it('merges', async () => {
    await importText(exported())
    const dialog = useDialogStore()
    expect(dialog.request?.message).toBe('Import 1 preset from presets.json?')
    dialog.answer('merge')
    await flushPromises()
    expect(names()).toEqual(['Ominous Glow', 'Alarm', 'Two-tone Glow', 'Vertical Pulse', 'Lighthouse', 'Imported'])
  })

  it('replaces after confirming, clearing a vanished active preset', async () => {
    const live = useLiveStore()
    live.activeId = usePresetsStore().presets[0]?.id ?? null
    await importText(exported())
    const dialog = useDialogStore()
    dialog.answer('replace')
    await flushPromises()
    expect(dialog.request?.message).toBe('Replace all 5 presets with the 1 imported?')
    dialog.answer('ok')
    await flushPromises()
    expect(names()).toEqual(['Imported'])
    expect(live.activeId).toBeNull()
  })

  it('reports a bad file and changes nothing', async () => {
    await importText('{"app":"nope"}')
    expect(useDialogStore().request?.message).toBe('Import failed: The file is not a Lightbox preset export.')
    expect(names()).toEqual(['Ominous Glow', 'Alarm', 'Two-tone Glow', 'Vertical Pulse', 'Lighthouse'])
  })
})

describe('shortcuts', () => {
  const Host = defineComponent({
    setup() {
      useShortcuts()
      return () => h('div', [h('input', { type: 'text' }), h('input', { type: 'range' })])
    },
  })

  function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
  }

  it('1–9 select by position, B toggles blackout', async () => {
    mount(Host, { attachTo: document.body })
    press('2')
    await flushPromises()
    expect(useLiveStore().activeId).toBe(usePresetsStore().presets[1]?.id)
    press('b')
    expect(useGlobalStore().blackout).toBe(true)
    press('B')
    expect(useGlobalStore().blackout).toBe(false)
  })

  it('are ignored while typing, with modifiers, or with a dialog open', async () => {
    const w = mount(Host, { attachTo: document.body })
    press('b', {}, w.get('input[type="text"]').element)
    expect(useGlobalStore().blackout, 'text').toBe(false)
    press('b', { ctrlKey: true })
    expect(useGlobalStore().blackout, 'ctrl').toBe(false)
    void useDialogStore().confirm('?', 'ok')
    press('b')
    expect(useGlobalStore().blackout).toBe(false)
    useDialogStore().answer(null)
    press('b', {}, w.get('input[type="range"]').element) // sliders don't take text
    expect(useGlobalStore().blackout).toBe(true)
  })

  it('isTyping knows text fields', () => {
    const el = (tag: string, type?: string) => Object.assign(document.createElement(tag), type ? { type } : {})
    expect(isTyping(el('input', 'text'))).toBe(true)
    expect(isTyping(el('input', 'number'))).toBe(true)
    expect(isTyping(el('textarea'))).toBe(true)
    expect(isTyping(el('select'))).toBe(true)
    expect(isTyping(el('input', 'range'))).toBe(false)
    expect(isTyping(el('button'))).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
})
