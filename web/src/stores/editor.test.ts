import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Command } from '../protocol/commands'
import { recordSent } from '../testing/sent'
import { useDialogStore } from './dialog'
import { useEditorStore } from './editor'
import { useLiveStore } from './live'
import { usePresetsStore } from './presets'

let sent: Command[]

function setup() {
  const presets = usePresetsStore()
  const [ominous, alarm] = presets.presets
  if (!ominous || !alarm) throw new Error('seed')
  return { presets, editor: useEditorStore(), live: useLiveStore(), dialog: useDialogStore(), ominous, alarm }
}

/** Answers the next dialog once it appears. */
async function answerNext(value: string | null): Promise<void> {
  const dialog = useDialogStore()
  await Promise.resolve()
  if (!dialog.request) throw new Error('no dialog open')
  dialog.answer(value)
}

const lastP = () => sent.filter((c) => c.type === 'P').at(-1)

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  sent = recordSent()
})

describe('selecting presets', () => {
  it('makes a preset active and loads it', async () => {
    const { editor, live, alarm } = setup()
    await editor.select(alarm.id)
    expect(live.activeId).toBe(alarm.id)
    expect(sent).toEqual([{ type: 'P', style: 1, rate: 500, brightness: 800, colors: ['#FF0000'], params: [0] }])
    expect(live.current).toMatchObject({ style: 'alarm', rate: 0.5 })
  })

  it('does nothing when the preset is already active (↻ restarts it)', async () => {
    const { editor, alarm } = setup()
    await editor.select(alarm.id)
    await editor.select(alarm.id)
    expect(sent).toHaveLength(1)
    await editor.reload(alarm.id)
    expect(sent).toHaveLength(2)
  })

  it('selects by list position', async () => {
    const { editor, live, alarm } = setup()
    await editor.selectIndex(1)
    expect(live.activeId).toBe(alarm.id)
    await editor.selectIndex(8) // no such row
    expect(live.activeId).toBe(alarm.id)
  })

  it('↻ puts live values back to the preset', async () => {
    const { editor, live, alarm } = setup()
    await editor.select(alarm.id)
    live.setRate(0.9)
    await editor.reload(alarm.id)
    expect(live.current.rate).toBe(0.5)
    expect(lastP()).toMatchObject({ rate: 500 })
  })
})

describe('editing', () => {
  it('opening the editor makes the preset active', async () => {
    const { editor, live, alarm } = setup()
    await editor.edit(alarm.id)
    expect(editor.isOpen).toBe(true)
    expect(editor.editingId).toBe(alarm.id)
    expect(live.activeId).toBe(alarm.id)
    expect(lastP()).toMatchObject({ style: 1 })
  })

  it('previews every change live without storing it', async () => {
    const { editor, presets, alarm } = setup()
    await editor.edit(alarm.id)
    sent.length = 0
    editor.setColor(0, '#00ff00')
    editor.setRate(0.25)
    editor.setBrightness(1)
    editor.setParam('tail', 6)
    editor.setName('Green')
    expect(sent).toEqual([
      { type: 'C', slot: 0, color: '#00FF00' },
      { type: 'R', rate: 250 },
      { type: 'B', brightness: 1000 },
      { type: 'A', idx: 0, value: 6 },
    ])
    expect(editor.dirty).toBe(true)
    expect(presets.byId(alarm.id)).toEqual(alarm)
  })

  it('Save stores the draft and closes', async () => {
    const { editor, presets, live, alarm } = setup()
    await editor.edit(alarm.id)
    editor.setName('  Green  ')
    editor.setColor(0, '#00ff00')
    editor.save()
    expect(editor.isOpen).toBe(false)
    expect(presets.byId(alarm.id)).toMatchObject({ name: 'Green', colors: ['#00FF00'] })
    expect(live.activeId).toBe(alarm.id)
  })

  it('Save names a blank preset after its style', async () => {
    const { editor, presets, alarm } = setup()
    await editor.edit(alarm.id)
    editor.setName('   ')
    editor.save()
    expect(presets.byId(alarm.id)?.name).toBe('Alarm')
  })

  it('✕ discards the draft and reloads the saved preset', async () => {
    const { editor, presets, alarm } = setup()
    await editor.edit(alarm.id)
    editor.setColor(0, '#00ff00')
    editor.setRate(1)
    editor.discard()
    expect(editor.isOpen).toBe(false)
    expect(presets.byId(alarm.id)).toEqual(alarm)
    expect(sent.at(-1)).toEqual({ type: 'P', style: 1, rate: 500, brightness: 800, colors: ['#FF0000'], params: [0] })
  })

  it('changing style starts from that style’s defaults and keeps rate/brightness', async () => {
    const { editor, ominous } = setup()
    await editor.edit(ominous.id)
    editor.setRate(0.2)
    editor.setStyle('alarm')
    expect(editor.draft).toMatchObject({ name: 'Alarm', style: 'alarm', colors: ['#FF0000'], params: { tail: 0 }, rate: 0.2 })
    expect(lastP()).toMatchObject({ style: 1, rate: 200 })
    editor.setName('Mine')
    editor.setStyle('ominous')
    expect(editor.draft).toMatchObject({ name: 'Mine', params: {} })
  })

  it('duplicate saves the draft as a copy after the original and edits the copy', async () => {
    const { editor, presets, live, ominous, alarm } = setup()
    await editor.edit(ominous.id)
    editor.setColor(0, '#112233')
    editor.duplicate()
    const names = presets.presets.map((p) => p.name)
    expect(names).toEqual(['Ominous Glow', 'Ominous Glow copy', 'Alarm', 'Two-tone Glow', 'Vertical Pulse', 'Lighthouse'])
    const copy = presets.presets[1]
    expect(copy?.colors).toEqual(['#112233'])
    expect(presets.byId(ominous.id)).toEqual(ominous)
    expect(editor.editingId).toBe(copy?.id)
    expect(editor.dirty).toBe(false)
    expect(live.activeId).toBe(copy?.id)
    expect(presets.byId(alarm.id)).toEqual(alarm)
  })

  it('delete asks first, then removes and closes', async () => {
    const { editor, presets, live, alarm } = setup()
    await editor.edit(alarm.id)
    const cancelled = editor.remove()
    await answerNext(null)
    await cancelled
    expect(presets.byId(alarm.id)).toBeDefined()
    const confirmed = editor.remove()
    expect(useDialogStore().request?.message).toBe('Delete “Alarm”?')
    await answerNext('ok')
    await confirmed
    expect(presets.byId(alarm.id)).toBeUndefined()
    expect(editor.isOpen).toBe(false)
    expect(live.activeId).toBeNull()
  })
})

describe('new presets', () => {
  it('+ drafts the first style; Save adds it and makes it active', async () => {
    const { editor, presets, live } = setup()
    await editor.create()
    expect(editor.isNew).toBe(true)
    expect(live.activeId).toBeNull()
    expect(lastP()).toMatchObject({ style: 0 })
    editor.setName('Fresh')
    editor.save()
    const added = presets.presets.at(-1)
    expect(added?.name).toBe('Fresh')
    expect(live.activeId).toBe(added?.id)
  })

  it('✕ creates nothing and goes back to the previous preset', async () => {
    const { editor, presets, live, alarm } = setup()
    await editor.select(alarm.id)
    await editor.create()
    editor.setStyle('alarm')
    editor.setColor(0, '#0000ff')
    editor.discard()
    expect(presets.presets).toHaveLength(5)
    expect(live.activeId).toBe(alarm.id)
    expect(lastP()).toMatchObject({ style: 1, colors: ['#FF0000'] })
  })

  it('an untouched new draft is not "unsaved"', async () => {
    const { editor, alarm, live } = setup()
    await editor.create()
    await editor.select(alarm.id)
    expect(useDialogStore().request).toBeNull()
    expect(live.activeId).toBe(alarm.id)
    expect(editor.isOpen).toBe(false)
  })
})

describe('unsaved changes', () => {
  async function dirtyOminous() {
    const s = setup()
    await s.editor.edit(s.ominous.id)
    s.editor.setRate(0.9)
    return s
  }

  it.each([
    ['selecting another preset', (s: ReturnType<typeof setup>) => s.editor.select(s.alarm.id)],
    ['pressing 2', (s: ReturnType<typeof setup>) => s.editor.selectIndex(1)],
    ['opening another editor', (s: ReturnType<typeof setup>) => s.editor.edit(s.alarm.id)],
    ['pressing +', (s: ReturnType<typeof setup>) => s.editor.create()],
  ])('%s asks first; Cancel keeps the draft', async (_, action) => {
    const s = await dirtyOminous()
    const done = action(s)
    expect(s.dialog.request?.message).toBe('Discard unsaved changes?')
    await answerNext(null)
    await done
    expect(s.editor.editingId).toBe(s.ominous.id)
    expect(s.editor.draft?.rate).toBe(0.9)
    expect(s.live.activeId).toBe(s.ominous.id)
  })

  it('Discard goes ahead', async () => {
    const s = await dirtyOminous()
    const done = s.editor.select(s.alarm.id)
    await answerNext('ok')
    await done
    expect(s.editor.isOpen).toBe(false)
    expect(s.live.activeId).toBe(s.alarm.id)
    expect(s.presets.byId(s.ominous.id)?.rate).toBe(0.5)
  })

  it('↻ on the edited preset asks, then resets the draft and keeps the editor open', async () => {
    const s = await dirtyOminous()
    const done = s.editor.reload(s.ominous.id)
    await answerNext('ok')
    await done
    expect(s.editor.isOpen).toBe(true)
    expect(s.editor.dirty).toBe(false)
    expect(s.live.current.rate).toBe(0.5)
  })

  it('clicking the row being edited does nothing', async () => {
    const s = await dirtyOminous()
    await s.editor.select(s.ominous.id)
    expect(s.dialog.request).toBeNull()
    expect(s.editor.draft?.rate).toBe(0.9)
  })
})

describe('live store', () => {
  it('resends the board state: P from the live values, then G (no L while the LFO is off)', async () => {
    const { editor, live, alarm } = setup()
    await editor.select(alarm.id)
    live.setBrightness(0.3)
    expect(live.resyncCommands()).toEqual([
      { type: 'P', style: 1, rate: 500, brightness: 300, colors: ['#FF0000'], params: [0] },
      { type: 'G', global: 1000 },
    ])
  })

  it('ignores params the current style does not have', () => {
    const { live } = setup()
    live.setParam('tail', 3)
    expect(sent).toEqual([])
  })
})
