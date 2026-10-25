import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const status = (page: Page) => page.getByTestId('connection-status')
const fakeState = (page: Page) => page.evaluate(() => window.__fake.state())
const sentLines = (page: Page) => page.evaluate(() => window.__fake.lines())
const rows = (page: Page) => page.getByTestId('preset-row')
const editor = (page: Page) => page.getByRole('form', { name: 'Preset editor' })
const dialog = (page: Page) => page.getByRole('dialog')
const current = (page: Page) => page.getByRole('region', { name: 'Current' })
const lfo = (page: Page) => page.getByRole('region', { name: 'LFO' })
const storedPresets = (page: Page) => page.evaluate(() => localStorage.getItem('lightbox.presets.v1'))
/** Seeded after Ominous Glow and Alarm. */
const PHASE4_ROWS = [/Two-tone Glow/, /Vertical Pulse/, /Lighthouse/]

async function connect(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(status(page)).toHaveText('Connected', { timeout: 10_000 })
}

/** Drops the focused element so page-level shortcuts reach the app. */
async function blur(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

test('connects and puts the first preset on the board', async ({ page }) => {
  await connect(page)
  expect((await sentLines(page)).map((l) => l[0])).toEqual(['H', 'P', 'G', '?'])
  expect(await fakeState(page)).toMatchObject({ style: 0, rate: 500, brightness: 800, global: 1000, colors: ['#9966CC', '#000000'] })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Alarm/, ...PHASE4_ROWS])
  await expect(page.getByRole('radio', { name: 'Select Ominous Glow' })).toBeChecked()
})

test('the layout follows the sketch', async ({ page }) => {
  await connect(page)
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Presets', 'Current', 'Brightness'])
  const box = async (name: string) => page.getByRole('region', { name, exact: true }).boundingBox()
  const x = async (name: string) => (await box(name))?.x ?? -1
  expect(await x('Presets')).toBeLessThan(await x('Current'))
  expect(await x('Current')).toBeLessThan(await x('Brightness'))
  const currentBox = await box('Current')
  // The editor opens in Current's place and Current comes back when it closes.
  await page.getByRole('button', { name: 'Edit Alarm' }).click()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Presets', 'Edit/Create', 'Brightness'])
  expect((await box('Edit/Create'))?.x).toBe(currentBox?.x)
  await expect(lfo(page)).toHaveCount(0) // the editor covers the LFO too
  await editor(page).getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Presets', 'Current', 'Brightness'])
  // LFO sits below Current, in the same column.
  const lfoBox = await lfo(page).boundingBox()
  const currentNow = await box('Current')
  expect(lfoBox && currentNow && lfoBox.y >= currentNow.y + currentNow.height).toBe(true)
  expect(lfoBox && currentNow && Math.abs(lfoBox.x - currentNow.x) < 1).toBe(true)
  const slider = await page.getByRole('slider', { name: 'Global brightness' }).boundingBox()
  expect(slider && slider.height > slider.width * 3).toBe(true)
})

test('selects presets by row, radio and number key', async ({ page }) => {
  await connect(page)
  await rows(page).nth(1).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1, colors: ['#FF0000', '#000000'] })
  // The app checks it once the switch goes ahead (an unsaved draft could still cancel it).
  await page.getByRole('radio', { name: 'Select Ominous Glow' }).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 0 })
  await expect(page.getByRole('radio', { name: 'Select Ominous Glow' })).toBeChecked()
  await blur(page)
  await page.keyboard.press('2')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1 })
  await expect(page.getByRole('radio', { name: 'Select Alarm' })).toBeChecked()
})

test('builds presets and switches between them live', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'New preset' }).click()
  await editor(page).getByLabel('Name').fill('Slow red')
  await editor(page).getByLabel('Style').selectOption('Alarm')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1 })
  await editor(page).getByLabel('Colour 1').fill('#ff8800')
  await expect.poll(() => fakeState(page)).toMatchObject({ colors: ['#FF8800', '#000000'] })
  await editor(page).getByLabel('Tail').fill('4')
  await expect.poll(() => fakeState(page)).toMatchObject({ params: [4, 2, 0, 0, 0] })
  await editor(page).getByRole('button', { name: 'Save' }).click()
  await expect(editor(page)).toHaveCount(0)
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Alarm/, ...PHASE4_ROWS, /Slow red/])
  await expect(page.getByRole('radio', { name: 'Select Slow red' })).toBeChecked()

  await rows(page).first().click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 0 })
  await blur(page)
  await page.keyboard.press('6')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1, colors: ['#FF8800', '#000000'], params: [4, 2, 0, 0, 0] })

  await page.reload()
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Alarm/, ...PHASE4_ROWS, /Slow red/])
})

test('✕ puts the lights and the stored preset back', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Edit Alarm' }).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1 })
  await editor(page).getByLabel('Colour 1').fill('#00ff00')
  await editor(page).getByLabel('Name').fill('Changed')
  await expect.poll(() => fakeState(page)).toMatchObject({ colors: ['#00FF00', '#000000'] })
  await editor(page).getByRole('button', { name: 'Close editor and discard changes' }).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1, colors: ['#FF0000', '#000000'] })
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Alarm/, ...PHASE4_ROWS])
  await page.reload()
  await page.getByRole('button', { name: 'Edit Alarm' }).click()
  await expect(editor(page).getByLabel('Colour 1')).toHaveValue('#ff0000')
})

test('unsaved changes ask before switching', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Edit Alarm' }).click()
  await editor(page).getByLabel('Name').fill('Changed')
  await blur(page)
  await page.keyboard.press('1')
  await expect(dialog(page)).toContainText('Discard unsaved changes?')
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(editor(page).getByLabel('Name')).toHaveValue('Changed')
  expect(await fakeState(page)).toMatchObject({ style: 1 })
  await rows(page).first().click()
  await dialog(page).getByRole('button', { name: 'Discard' }).click()
  await expect(editor(page)).toHaveCount(0)
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 0 })
})

test('↻ on the active row restarts it', async ({ page }) => {
  await connect(page)
  await rows(page).nth(1).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1 })
  const before = (await sentLines(page)).length
  await page.getByRole('button', { name: 'Reload Alarm' }).click()
  await expect.poll(async () => (await sentLines(page)).slice(before).map((l) => l.split(' ')[0])).toEqual(['P'])
  await expect(page.getByRole('button', { name: /^Reload/ })).toHaveCount(1)
})

test('duplicate and delete', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Edit Alarm' }).click()
  await editor(page).getByRole('button', { name: 'Duplicate' }).click()
  await expect(rows(page)).toHaveText([/Ominous Glow/, /^.*Alarm(?! copy)/, /Alarm copy/, ...PHASE4_ROWS])
  await expect(editor(page).getByLabel('Name')).toHaveValue('Alarm copy')
  await editor(page).getByRole('button', { name: 'Delete' }).click()
  await expect(dialog(page)).toContainText('Delete “Alarm copy”?')
  await dialog(page).getByRole('button', { name: 'Delete' }).click()
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Alarm/, ...PHASE4_ROWS])
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
})

test('the Phase 4 styles load from their seeded presets', async ({ page }) => {
  await connect(page)
  await rows(page).nth(2).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 2, colors: ['#FF4000', '#8000FF'] })
  await rows(page).nth(3).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 3, colors: ['#9966CC', '#000000'] })
  await page.getByRole('button', { name: 'Edit Lighthouse' }).click()
  await editor(page).getByLabel('Front column').fill('9')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 4, params: [60, 50, 5, 9, 1] })
})

test('style options reach the board: sliders and the whip shape dropdown', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Edit Ominous Glow' }).click()
  await editor(page).getByLabel('Minimum').fill('35')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 0, params: [35, 0, 0, 0, 0] })
  await editor(page).getByLabel('Style').selectOption('pulse')
  await editor(page).getByLabel('Thickness').fill('24')
  await editor(page).getByLabel('Whip', { exact: true }).fill('70')
  await editor(page).getByLabel('Whip shape').selectOption('Fast middle')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 3, params: [24, 70, 1, 0, 0] })
  await editor(page).getByLabel('Style').selectOption('lighthouse')
  await editor(page).getByLabel('Beams').fill('3')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 4, params: [60, 50, 5, 0, 3] })
})

test('drag to reorder; numbers follow the order', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Move Alarm (arrow keys)' }).dragTo(rows(page).first())
  await expect(rows(page)).toHaveText([/Alarm/, /Ominous Glow/, ...PHASE4_ROWS])
  await expect(rows(page).first().locator('.badge')).toHaveText('1')
  await page.getByRole('button', { name: 'Move Alarm (arrow keys)' }).press('ArrowDown')
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Alarm/, ...PHASE4_ROWS])
  await page.reload()
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Alarm/, ...PHASE4_ROWS])
})

test('global brightness scales to off, persists, and ↻ restores 100%', async ({ page }) => {
  await connect(page)
  const slider = page.getByRole('slider', { name: 'Global brightness' })
  await slider.fill('0.25')
  await expect.poll(() => fakeState(page)).toMatchObject({ global: 250 })
  await slider.fill('0')
  await expect.poll(() => fakeState(page)).toMatchObject({ global: 0 })
  await page.reload()
  await expect(status(page)).toHaveText('Connected', { timeout: 10_000 })
  await expect(slider).toHaveValue('0')
  expect(await fakeState(page)).toMatchObject({ global: 0 })
  await page.getByRole('button', { name: 'Global brightness to 100%' }).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ global: 1000 })
})

test('blackout from the B key and the button', async ({ page }) => {
  await connect(page)
  await page.getByRole('slider', { name: 'Global brightness' }).fill('0.6')
  await blur(page)
  await page.keyboard.press('b')
  await expect.poll(() => fakeState(page)).toMatchObject({ global: 0 })
  await expect(page.getByRole('button', { name: 'Blackout ON' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Blackout' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Global brightness' })).toHaveValue('0.6')
  await page.getByRole('button', { name: 'Blackout ON' }).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ global: 600 })
  // Typing a name doesn't trigger shortcuts.
  await page.getByRole('button', { name: 'New preset' }).click()
  await editor(page).getByLabel('Name').fill('b2')
  expect(await fakeState(page)).toMatchObject({ global: 600 })
})

test('export, clear storage, import → identical presets', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Edit Alarm' }).click()
  await editor(page).getByLabel('Name').fill('Mine')
  await editor(page).getByLabel('Tail').fill('7')
  await editor(page).getByRole('button', { name: 'Save' }).click()
  const before = await page.evaluate(() => localStorage.getItem('lightbox.presets.v1'))

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^lightbox-presets-\d{8}\.json$/)
  const path = await file.path()

  await page.evaluate(() => localStorage.removeItem('lightbox.presets.v1'))
  await page.reload()
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Alarm/, ...PHASE4_ROWS])

  await page.getByTestId('import-file').setInputFiles(path)
  await expect(dialog(page)).toContainText('Import 5 presets')
  await dialog(page).getByRole('button', { name: 'Replace' }).click()
  await expect(dialog(page)).toContainText('Replace all 5 presets with the 5 imported?')
  await dialog(page).getByRole('button', { name: 'Replace' }).click()
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Mine/, ...PHASE4_ROWS])
  expect(await page.evaluate(() => localStorage.getItem('lightbox.presets.v1'))).toBe(before)
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ app: 'lightbox', version: 1 })
})

test('import merge appends; a bad file is rejected', async ({ page }) => {
  await connect(page)
  const exported = JSON.stringify({ app: 'lightbox', version: 1, exportedAt: '', presets: [{ id: 'x', name: 'Imported', style: 'alarm', colors: ['#00FF00'], rate: 0.1, brightness: 0.9, params: { tail: 3 } }] })
  await page.getByTestId('import-file').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(exported) })
  await dialog(page).getByRole('button', { name: 'Merge' }).click()
  await expect(rows(page)).toHaveText([/Ominous Glow/, /Alarm/, ...PHASE4_ROWS, /Imported/])
  await page.getByTestId('import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('nope') })
  await expect(dialog(page)).toContainText('Import failed: The file is not valid JSON.')
  await dialog(page).getByRole('button', { name: 'OK' }).click()
  await expect(rows(page)).toHaveCount(6)
})

test('unplug shows the banner; replug reconnects and resends the state', async ({ page }) => {
  await connect(page)
  await rows(page).nth(1).click()
  await page.getByRole('slider', { name: 'Global brightness' }).fill('0.5')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1, global: 500 })
  await page.evaluate(() => window.__fake.unplug())
  await expect(page.getByRole('alert')).toHaveText('Disconnected — reconnecting')
  await expect(status(page)).toHaveText('Reconnecting…')
  await page.evaluate(() => window.__fake.replug())
  await expect(status(page)).toHaveText('Connected', { timeout: 10_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => window.__fake.opens())).toBe(2)
  // Opening the port reset the board, so this proves the full state was resent.
  expect(await fakeState(page)).toMatchObject({ style: 1, global: 500 })
})

test('reconnects silently on reload once the port is granted', async ({ page }) => {
  await connect(page)
  await page.reload()
  await expect(status(page)).toHaveText('Connected', { timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Connect' })).toHaveCount(0)
})

test('a slider drag coalesces: only the latest value is sent', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Edit Ominous Glow' }).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 0 })
  await page.evaluate(() => window.__fake.setReplyDelay(150))
  const before = (await sentLines(page)).length
  const box = await editor(page).getByLabel('Rate').boundingBox()
  if (!box) throw new Error('no rate slider')
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  for (let i = 0; i <= 20; i++) await page.mouse.move(box.x + box.width / 2 + (i * box.width) / 40, y)
  await page.mouse.move(box.x + box.width + 10, y)
  await page.mouse.up()
  await expect.poll(() => fakeState(page)).toMatchObject({ rate: 1000 })
  await page.waitForTimeout(400)
  const sent = (await sentLines(page)).slice(before)
  expect(sent.every((l) => l.startsWith('R '))).toBe(true)
  expect(sent.length).toBeLessThan(8)
  expect(sent.at(-1)?.startsWith('R 1000*')).toBe(true)
})

test('Current: live rate/brightness change the board, not the preset; ↻ and selecting reset them', async ({ page }) => {
  await connect(page)
  const before = await storedPresets(page)
  await current(page).getByLabel('Rate', { exact: true }).fill('0.9')
  await current(page).getByLabel('Brightness', { exact: true }).fill('0.2')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 0, rate: 900, brightness: 200 })
  expect(await storedPresets(page)).toBe(before)
  await current(page).getByRole('button', { name: 'Reset rate to preset' }).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ rate: 500, brightness: 200 })
  await current(page).getByRole('button', { name: 'Reset brightness to preset' }).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ rate: 500, brightness: 800 })

  await current(page).getByLabel('Rate', { exact: true }).fill('0.9')
  await rows(page).nth(1).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1, rate: 500, brightness: 800 })
  await expect(current(page).getByLabel('Rate', { exact: true })).toHaveValue('0.5')

  // After editing, ↻ returns to the saved values.
  await page.getByRole('button', { name: 'Edit Alarm' }).click()
  await editor(page).getByLabel('Rate').fill('0.3')
  await editor(page).getByRole('button', { name: 'Save' }).click()
  await current(page).getByLabel('Rate', { exact: true }).fill('1')
  await current(page).getByRole('button', { name: 'Reset rate to preset' }).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ rate: 300 })
  expect(await storedPresets(page)).toContain('"rate":0.3')
})

test('arrow keys nudge the live values', async ({ page }) => {
  await connect(page)
  await blur(page)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => fakeState(page)).toMatchObject({ rate: 600, brightness: 850 })
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(() => fakeState(page)).toMatchObject({ rate: 590, brightness: 840 })
  await expect(current(page).getByLabel('Rate', { exact: true })).toHaveValue('0.59')
  await expect(current(page).getByLabel('Brightness', { exact: true })).toHaveValue('0.84')
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp')
  await expect.poll(() => fakeState(page)).toMatchObject({ brightness: 1000 })
})

test('a Current slider drag coalesces: only the latest value is sent', async ({ page }) => {
  await connect(page)
  await page.evaluate(() => window.__fake.setReplyDelay(150))
  const before = (await sentLines(page)).length
  const box = await current(page).getByLabel('Brightness', { exact: true }).boundingBox()
  if (!box) throw new Error('no brightness slider')
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  for (let i = 0; i <= 20; i++) await page.mouse.move(box.x + box.width / 2 - (i * box.width) / 40, y)
  await page.mouse.move(box.x - 10, y)
  await page.mouse.up()
  await expect.poll(() => fakeState(page)).toMatchObject({ brightness: 0 })
  await page.waitForTimeout(400)
  const sent = (await sentLines(page)).slice(before)
  expect(sent.every((l) => l.startsWith('B '))).toBe(true)
  expect(sent.length).toBeLessThan(8)
  expect(sent.at(-1)?.startsWith('B 0*')).toBe(true)
})

test('LFO: enable, change settings live, and a preset load turns it off', async ({ page }) => {
  await connect(page)
  const enable = lfo(page).getByRole('switch', { name: 'Enable' })
  await expect(enable).not.toBeChecked()
  await enable.check()
  await expect.poll(() => fakeState(page)).toMatchObject({ lfo: { on: 1, target: 1, mHz: 1000, depth: 500 } })
  await lfo(page).getByLabel('Destination').selectOption('Rate')
  await lfo(page).getByLabel('Rate', { exact: true }).fill('0')
  await lfo(page).getByLabel('Intensity').fill('1')
  await expect.poll(() => fakeState(page)).toMatchObject({ lfo: { on: 1, target: 0, mHz: 10, depth: 1000 } })
  await expect(lfo(page).getByText('0.010 Hz')).toBeVisible()
  // The live values themselves don't move: the board does the modulation.
  expect(await fakeState(page)).toMatchObject({ rate: 500, brightness: 800 })

  await rows(page).nth(1).click()
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1, lfo: { on: 0, target: 0, mHz: 10, depth: 1000 } })
  await expect(enable).not.toBeChecked()
  expect((await sentLines(page)).at(-1)?.[0]).toBe('P') // P alone turns it off

  // Changes while off are kept but not sent; enabling sends them.
  await lfo(page).getByLabel('Intensity').fill('0.3')
  await page.waitForTimeout(200)
  expect(await fakeState(page)).toMatchObject({ lfo: { on: 0, depth: 1000 } })
  await enable.check()
  await expect.poll(() => fakeState(page)).toMatchObject({ lfo: { on: 1, target: 0, mHz: 10, depth: 300 } })
  await enable.uncheck()
  await expect.poll(() => fakeState(page)).toMatchObject({ lfo: { on: 0 } })
})

test('LFO settings persist; on/off does not', async ({ page }) => {
  await connect(page)
  await lfo(page).getByLabel('Destination').selectOption('Rate')
  await lfo(page).getByLabel('Intensity').fill('0.8')
  await lfo(page).getByRole('switch', { name: 'Enable' }).check()
  await page.reload()
  await expect(status(page)).toHaveText('Connected', { timeout: 10_000 })
  await expect(lfo(page).getByRole('switch', { name: 'Enable' })).not.toBeChecked()
  await expect(lfo(page).getByLabel('Destination')).toHaveValue('rate')
  await expect(lfo(page).getByLabel('Intensity')).toHaveValue('0.8')
  expect(await fakeState(page)).toMatchObject({ lfo: { on: 0 } })
})

test('a running LFO survives a replug: P, G, then L are resent', async ({ page }) => {
  await connect(page)
  await lfo(page).getByRole('switch', { name: 'Enable' }).check()
  await expect.poll(() => fakeState(page)).toMatchObject({ lfo: { on: 1 } })
  await page.evaluate(() => window.__fake.unplug())
  await expect(status(page)).toHaveText('Reconnecting…')
  await page.evaluate(() => window.__fake.replug())
  await expect(status(page)).toHaveText('Connected', { timeout: 10_000 })
  expect((await sentLines(page)).slice(-4).map((l) => l[0])).toEqual(['P', 'G', 'L', '?'])
  expect(await fakeState(page)).toMatchObject({ lfo: { on: 1, target: 1, mHz: 1000, depth: 500 } })
  await expect(page.getByRole('alert')).toHaveCount(0) // no banner, and the `?` check matched
})
