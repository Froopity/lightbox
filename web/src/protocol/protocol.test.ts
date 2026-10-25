import { describe, expect, it } from 'vitest'
import { checksum, withChecksum } from './checksum'
import { coalesceKey, encode, wireColor } from './commands'
import { bootState, DeviceModel, dumpLine } from './device'
import { BOOT_STATE, FIXTURES } from './fixtures'

describe('protocol fixtures (shared with the firmware)', () => {
  it('boot state matches', () => {
    expect(bootState()).toEqual(BOOT_STATE)
  })

  it('has exactly one expectation kind per fixture', () => {
    for (const f of FIXTURES) expect((f.expectReply === undefined) !== (f.expectError === undefined), f.name).toBe(true)
  })

  describe.each(FIXTURES.map((f) => [f.name, f] as const))('%s', (_, f) => {
    if (f.cmd) {
      const cmd = f.cmd
      it('encodes', () => expect(encode(cmd)).toBe(f.line))
    }
    it('decodes', () => {
      const d = new DeviceModel()
      for (const line of f.before ?? []) expect(d.handle(line)).toBe('OK')
      const before = structuredClone(d.state)
      const reply = d.handle(f.line)
      if (f.expectError !== undefined) {
        expect(reply).toBe(`ERR ${f.expectError}`)
        expect(d.state).toEqual(before)
      } else {
        expect(reply).toBe(f.expectReply)
      }
      if (f.expectState) expect(d.state).toMatchObject(f.expectState)
    })
  })
})

describe('encoder', () => {
  it('pads colours and params to the fixed slot counts', () => {
    expect(encode({ type: 'P', style: 0, rate: 1, brightness: 2, colors: ['#abcdef'], params: [] })).toBe(
      withChecksum('P 0 1 2 ABCDEF 000000 0 0 0 0 0'),
    )
  })

  it('rejects values that are not wire integers', () => {
    expect(() => encode({ type: 'R', rate: 1.5 })).toThrow(RangeError)
    expect(() => encode({ type: 'R', rate: -1 })).toThrow(RangeError)
    expect(() => encode({ type: 'G', global: 70000 })).toThrow(RangeError)
    expect(() => wireColor('#12345')).toThrow(RangeError)
  })

  it('checksums are the XOR of the payload in two uppercase hex digits', () => {
    expect(checksum('')).toBe('00')
    expect(checksum('H')).toBe('48')
    expect(checksum('R 5')).toBe((0x52 ^ 0x20 ^ 0x35).toString(16).toUpperCase())
  })

  it('coalescing keys separate colour slots and params', () => {
    expect(coalesceKey({ type: 'R', rate: 1 })).toBe(coalesceKey({ type: 'R', rate: 2 }))
    expect(coalesceKey({ type: 'C', slot: 0, color: '#000000' })).not.toBe(coalesceKey({ type: 'C', slot: 1, color: '#000000' }))
    expect(coalesceKey({ type: 'A', idx: 0, value: 1 })).not.toBe(coalesceKey({ type: 'A', idx: 1, value: 1 }))
  })
})

describe('device model', () => {
  it('reports fps in the dump', () => {
    expect(dumpLine(bootState(), 284).endsWith(' 284')).toBe(true)
  })

  it('reset returns to boot state', () => {
    const d = new DeviceModel()
    d.handle(withChecksum('G 5'))
    d.reset()
    expect(d.state).toEqual(bootState())
  })
})
