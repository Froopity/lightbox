// A TypeScript model of the firmware's parser and state (firmware/lib/core/protocol.cpp, engine.cpp).
// Used by the fake WebSerial device in e2e tests and by the hardware smoke test to predict `?` dumps.
// Both it and the firmware must pass every case in shared/protocol-fixtures.json.
import { STYLES } from '../styles/registry'
import { DEFAULT_BRIGHTNESS, DEFAULT_GLOBAL, DEFAULT_RATE, MAX_COLORS, MAX_PARAMS, WIRE_MAX } from '../styles/types'
import { checksum } from './checksum'
import { ErrorCode, MAX_LINE, PROTOCOL_VERSION } from './commands'

export interface DeviceState {
  style: number
  rate: number
  brightness: number
  global: number
  /** "#RRGGBB", always MAX_COLORS entries. */
  colors: string[]
  /** Wire units, always MAX_PARAMS entries. */
  params: number[]
}

function styleDefaults(style: number): Pick<DeviceState, 'colors' | 'params'> {
  const s = STYLES[style]
  return {
    colors: Array.from({ length: MAX_COLORS }, (_, i) => (s?.defaultColors[i] ?? '#000000').toUpperCase()),
    params: Array.from({ length: MAX_PARAMS }, (_, i) => s?.params[i]?.default ?? 0),
  }
}

export function bootState(): DeviceState {
  return { style: 0, rate: DEFAULT_RATE, brightness: DEFAULT_BRIGHTNESS, global: DEFAULT_GLOBAL, ...styleDefaults(0) }
}

/** The `?` reply for a state (PLAN.md §4). LFO fields are placeholders until Phase 6. */
export function dumpLine(s: DeviceState, fps = 0): string {
  const colors = s.colors.map((c) => c.slice(1))
  return ['S', s.style, s.rate, s.brightness, s.global, ...colors, ...s.params, 0, 0, 0, 0, fps].join(' ')
}

class ArgError extends Error {}

/** Returns v once the line has no more arguments (so a bad line never changes state). */
function done<T>(a: Args, v: T): T {
  a.done()
  return v
}

/** Tokens after the command letter, parsed exactly like the firmware's Args. */
class Args {
  private pos = 0
  constructor(private readonly s: string) {}

  private space(): void {
    if (this.s[this.pos] !== ' ') throw new ArgError()
    this.pos++
  }
  private tokenEnd(): void {
    if (this.pos < this.s.length && this.s[this.pos] !== ' ') throw new ArgError()
  }
  num(max = 0xffff): number {
    this.space()
    const m = /^[0-9]+/.exec(this.s.slice(this.pos))
    if (!m) throw new ArgError()
    this.pos += m[0].length
    this.tokenEnd()
    const v = Number(m[0])
    if (v > Math.min(max, 0xffff)) throw new ArgError()
    return v
  }
  hex6(): string {
    this.space()
    const m = /^[0-9a-fA-F]{6}/.exec(this.s.slice(this.pos))
    if (!m) throw new ArgError()
    this.pos += 6
    this.tokenEnd()
    return `#${m[0].toUpperCase()}`
  }
  done(): void {
    if (this.pos !== this.s.length) throw new ArgError()
  }
}

export class DeviceModel {
  state: DeviceState = bootState()

  reset(): void {
    this.state = bootState()
  }

  /** Handles one line (without '\n') and returns the reply (without '\n'). */
  handle(line: string, fps = 0): string {
    if (line.length > MAX_LINE) return `ERR ${ErrorCode.lineTooLong}`
    const payload = line.slice(0, -3)
    const sum = line.slice(-3)
    if (line.length < 3 || !/^\*[0-9a-fA-F]{2}$/.test(sum) || sum.slice(1).toUpperCase() !== checksum(payload)) {
      return `ERR ${ErrorCode.checksum}`
    }
    const cmd = payload[0]
    if (cmd === undefined || (payload.length > 1 && payload[1] !== ' ')) return `ERR ${ErrorCode.unknownCommand}`
    try {
      return this.apply(cmd, new Args(payload.slice(1)), fps)
    } catch (e) {
      if (e instanceof ArgError) return `ERR ${ErrorCode.badArguments}`
      throw e
    }
  }

  private apply(cmd: string, a: Args, fps: number): string {
    const s = this.state
    switch (cmd) {
      case 'H':
        a.done()
        return `OK lightbox ${PROTOCOL_VERSION}`
      case '?':
        a.done()
        return dumpLine(s, fps)
      case 'P': {
        const style = a.num(STYLES.length - 1)
        const rate = a.num(WIRE_MAX)
        const brightness = a.num(WIRE_MAX)
        const colors = Array.from({ length: MAX_COLORS }, () => a.hex6())
        const params = Array.from({ length: MAX_PARAMS }, () => a.num())
        a.done()
        const defaults = styleDefaults(style)
        this.state = { ...s, style, rate, brightness, colors, params: defaults.params }
        params.forEach((v, i) => this.setParam(i, v))
        break
      }
      case 'R':
        s.rate = done(a, a.num(WIRE_MAX))
        break
      case 'B':
        s.brightness = done(a, a.num(WIRE_MAX))
        break
      case 'G':
        s.global = done(a, a.num(WIRE_MAX))
        break
      case 'C': {
        const slot = a.num(MAX_COLORS - 1)
        const color = a.hex6()
        a.done()
        s.colors[slot] = color
        break
      }
      case 'A': {
        const idx = a.num()
        const value = a.num()
        a.done()
        if (idx >= (STYLES[s.style]?.params.length ?? 0)) throw new ArgError()
        this.setParam(idx, value)
        break
      }
      default:
        return `ERR ${ErrorCode.unknownCommand}`
    }
    return 'OK'
  }

  /** Clamped to the style's range; params the style lacks are ignored. */
  private setParam(idx: number, value: number): void {
    const p = STYLES[this.state.style]?.params[idx]
    if (p) this.state.params[idx] = Math.min(p.wireMax, Math.max(p.wireMin, value))
  }
}
