import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const status = (page: Page) => page.getByTestId('connection-status')
const fakeState = (page: Page) => page.evaluate(() => window.__fake.state())

async function connect(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(status(page)).toHaveText('Connected', { timeout: 10_000 })
}

test('connects and puts the board in the UI state', async ({ page }) => {
  await connect(page)
  const lines = await page.evaluate(() => window.__fake.lines())
  expect(lines.map((l) => l[0])).toEqual(['H', 'P', 'G', '?'])
  expect(await fakeState(page)).toMatchObject({ style: 0, rate: 500, brightness: 800, global: 1000, colors: ['#9966CC', '#000000'] })
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('switches effects from the dropdown', async ({ page }) => {
  await connect(page)
  await page.getByLabel('Effect').selectOption('Alarm')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1, colors: ['#FF0000', '#000000'], params: [0, 0, 0, 0] })
  await page.getByLabel('Effect').selectOption('Ominous Glow')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 0, colors: ['#9966CC', '#000000'] })
})

test('unplug shows the banner; replug reconnects and resends the state', async ({ page }) => {
  await connect(page)
  await page.getByLabel('Effect').selectOption('Alarm')
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1 })
  await page.evaluate(() => window.__fake.unplug())
  await expect(page.getByRole('alert')).toHaveText('Disconnected — reconnecting')
  await expect(status(page)).toHaveText('Reconnecting…')
  await page.evaluate(() => window.__fake.replug())
  await expect(status(page)).toHaveText('Connected', { timeout: 10_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => window.__fake.opens())).toBe(2)
  // Opening the port reset the board, so this proves the full state was resent.
  expect(await fakeState(page)).toMatchObject({ style: 1, global: 1000 })
})

test('reconnects silently on reload once the port is granted', async ({ page }) => {
  await connect(page)
  await page.reload()
  await expect(status(page)).toHaveText('Connected', { timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Connect' })).toHaveCount(0)
})

test('rapid changes coalesce: only the last value is sent', async ({ page }) => {
  await connect(page)
  await page.evaluate(() => window.__fake.setReplyDelay(150))
  const before = (await page.evaluate(() => window.__fake.lines())).length
  const effect = page.getByLabel('Effect')
  for (const name of ['Alarm', 'Ominous Glow', 'Alarm', 'Ominous Glow', 'Alarm']) await effect.selectOption(name)
  await expect.poll(() => fakeState(page)).toMatchObject({ style: 1 })
  await page.waitForTimeout(400)
  const sent = (await page.evaluate(() => window.__fake.lines())).slice(before)
  // The first change goes straight out; the rest collapse into the final one while it's in flight.
  expect(sent.length).toBeLessThanOrEqual(2)
  expect(sent.at(-1)?.startsWith('P 1 ')).toBe(true)
})
