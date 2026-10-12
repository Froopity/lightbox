// Host → firmware commands and their wire encoding (PLAN.md §4). Mirrors firmware/lib/core/protocol.cpp.
import { MAX_COLORS, MAX_PARAMS } from '../styles/types'
import { withChecksum } from './checksum'

export const PROTOCOL_VERSION = 1
export const MAX_LINE = 72
export const WAKE_BYTE = 0x01
export const CTS_CHAR = '!'

export type Command =
  | { type: 'H' }
  | { type: '?' }
  | { type: 'P'; style: number; rate: number; brightness: number; colors: string[]; params: number[] }
  | { type: 'R'; rate: number }
  | { type: 'B'; brightness: number }
  | { type: 'G'; global: number }
  | { type: 'C'; slot: number; color: string }
  | { type: 'A'; idx: number; value: number }

export const ErrorCode = { checksum: 1, unknownCommand: 2, badArguments: 3, lineTooLong: 4 } as const

function int(v: number): string {
  if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new RangeError(`not a wire integer: ${v}`)
  return String(v)
}

/** "#rrggbb" or "rrggbb" → "RRGGBB". */
export function wireColor(c: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(c)
  if (!m?.[1]) throw new RangeError(`not a colour: ${c}`)
  return m[1].toUpperCase()
}

function payload(cmd: Command): string {
  switch (cmd.type) {
    case 'H':
    case '?':
      return cmd.type
    case 'P': {
      const colors = Array.from({ length: MAX_COLORS }, (_, i) => wireColor(cmd.colors[i] ?? '000000'))
      const params = Array.from({ length: MAX_PARAMS }, (_, i) => int(cmd.params[i] ?? 0))
      return ['P', int(cmd.style), int(cmd.rate), int(cmd.brightness), ...colors, ...params].join(' ')
    }
    case 'R':
      return `R ${int(cmd.rate)}`
    case 'B':
      return `B ${int(cmd.brightness)}`
    case 'G':
      return `G ${int(cmd.global)}`
    case 'C':
      return `C ${int(cmd.slot)} ${wireColor(cmd.color)}`
    case 'A':
      return `A ${int(cmd.idx)} ${int(cmd.value)}`
  }
}

/** The full line, checksum included, without the trailing '\n'. */
export function encode(cmd: Command): string {
  return withChecksum(payload(cmd))
}

/**
 * Pending commands with the same key replace each other (PLAN.md §4, coalescing):
 * one slot per command type, colour slot and param index.
 */
export function coalesceKey(cmd: Command): string {
  switch (cmd.type) {
    case 'C':
      return `C${cmd.slot}`
    case 'A':
      return `A${cmd.idx}`
    default:
      return cmd.type
  }
}
