// Shared by the generators: write the file, or with `--check` fail if the committed copy is stale.
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

export function writeOrCheck(path: string, content: string, check: boolean): void {
  const name = basename(path)
  if (!check) {
    writeFileSync(path, content)
    console.log(`wrote ${path}`)
    return
  }
  let current = ''
  try {
    current = readFileSync(path, 'utf8')
  } catch {
    // missing counts as stale
  }
  if (current !== content) {
    console.error(`${name} is out of date: run \`make gen\``)
    process.exit(1)
  }
  console.log(`${name} up to date`)
}
