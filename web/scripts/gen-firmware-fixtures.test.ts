import { describe, expect, it } from 'vitest'
import { bootState } from '../src/protocol/device'
import { render } from './gen-firmware-fixtures'

describe('gen-firmware-fixtures', () => {
  it('renders the boot state and a row with nullptr padding and unchecked slots', () => {
    const out = render(bootState(), [
      { name: 'g', before: ['H*48'], line: 'G 5*52', expectReply: 'OK', expectState: { global: 5, colors: ['#ABCDEF'] } },
    ])
    expect(out).toContain('BOOT_STATE[STATE_SLOTS] = {0, 500, 800, 1000, 0x9966CC, 0x000000, 0, 0, 0, 0};')
    expect(out).toContain('{"g", {"H*48", nullptr, nullptr, nullptr}, "G 5*52", "OK", 0, {-1, -1, -1, 5, 0xABCDEF, -1, -1, -1, -1, -1}},')
  })

  it('escapes quotes and backslashes', () => {
    expect(render(bootState(), [{ name: 'q"\\', line: 'X"\\', expectError: 2 }])).toContain('{"q\\"\\\\", ')
  })

  it('rejects a fixture with both or neither expectation', () => {
    expect(() => render(bootState(), [{ name: 'x', line: 'H*48' }])).toThrow(/exactly one/)
    expect(() => render(bootState(), [{ name: 'x', line: 'H*48', expectReply: 'OK', expectError: 1 }])).toThrow(/exactly one/)
  })
})
