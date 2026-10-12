// Playwright fixture: every page gets the fake Web Serial board from fake-serial-entry.ts.
import { test as base } from '@playwright/test'
import { buildSync } from 'esbuild'
import { fileURLToPath } from 'node:url'

const bundle = buildSync({
  entryPoints: [fileURLToPath(new URL('./fake-serial-entry.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
}).outputFiles[0]?.text

if (!bundle) throw new Error('failed to bundle the fake serial device')

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript({ content: bundle })
    await use(page)
  },
})

export { expect } from '@playwright/test'
