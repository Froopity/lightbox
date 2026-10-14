// Serial smoke test against a real board (PLAN.md §1, Phase 2 step 4). Port from LIGHTBOX_PORT.
// Uses the app's own Link (wake/CTS, retries) and predicts every `?` dump with the DeviceModel.
import { Duplex } from 'node:stream'
import { SerialPort } from 'serialport'
import { encode, LFO_MHZ_MAX, LFO_MHZ_MIN, type Command } from '../src/protocol/commands'
import { bootState, DeviceModel, dumpLine } from '../src/protocol/device'
import { Link } from '../src/serial/link'
import { STYLES } from '../src/styles/registry'
import { PORT_PATH, sleep } from './node-serial'

const COMMANDS = Number(process.env.SMOKE_COMMANDS ?? 1000)
const MIN_FPS = 100

function check(ok: boolean, msg: string): void {
  if (!ok) throw new Error(msg)
}

async function connect(): Promise<{ port: SerialPort; link: Link }> {
  const port = await new Promise<SerialPort>((resolve, reject) => {
    const p = new SerialPort({ path: PORT_PATH, baudRate: 115200 }, (err) => (err ? reject(err) : resolve(p)))
  })
  const { readable, writable } = Duplex.toWeb(port) as {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<Uint8Array>
  }
  const link = new Link(readable, writable)
  await sleep(2000) // DTR reset + bootloader
  const deadline = Date.now() + 5000
  for (;;) {
    const reply = await link.exchangeOnce(encode({ type: 'H' })).catch(() => null)
    if (reply === 'OK lightbox 1') break
    check(Date.now() < deadline, `no hello within 5 s (last reply: ${reply})`)
  }
  return { port, link }
}

async function disconnect({ port, link }: { port: SerialPort; link: Link }): Promise<void> {
  await link.close()
  if (port.isOpen) await new Promise<void>((resolve, reject) => port.close((err) => (err ? reject(err) : resolve())))
}

/** Dump without the trailing fps field, plus the fps. */
async function dump(link: Link): Promise<{ state: string; fps: number }> {
  const reply = await link.exchange(encode({ type: '?' }))
  const at = reply.lastIndexOf(' ')
  return { state: reply.slice(0, at), fps: Number(reply.slice(at + 1)) }
}

const int = (max: number): number => Math.floor(Math.random() * (max + 1))
const color = (): string => `#${int(0xffffff).toString(16).padStart(6, '0')}`

function randomCommand(style: number): Command {
  const params = STYLES[style]?.params ?? []
  switch (int(params.length > 0 ? 6 : 5)) {
    case 0: {
      const s = int(STYLES.length - 1)
      const ps = STYLES[s]?.params ?? []
      return { type: 'P', style: s, rate: int(1000), brightness: int(1000), colors: [color(), color()], params: ps.map((p) => p.wireMin + int(p.wireMax - p.wireMin)) }
    }
    case 1: return { type: 'R', rate: int(1000) }
    case 2: return { type: 'B', brightness: int(1000) }
    case 3: return { type: 'G', global: int(1000) }
    case 4: return { type: 'C', slot: int(1), color: color() }
    case 5: return { type: 'L', on: int(1) ? 1 : 0, target: int(1) ? 1 : 0, mHz: LFO_MHZ_MIN + int(LFO_MHZ_MAX - LFO_MHZ_MIN), depth: int(1000) }
    default: {
      const idx = int(params.length - 1)
      return { type: 'A', idx, value: int(params[idx]?.wireMax ?? 0) }
    }
  }
}

async function main(): Promise<void> {
  const conn = await connect()
  const { link } = conn
  const boot = dumpLine(bootState()).replace(/ 0$/, '')
  let d = await dump(link)
  check(d.state === boot, `boot dump "${d.state}" ≠ "${boot}"`)
  console.log(`smoke: hello + boot state OK, ${d.fps} fps`)

  const model = new DeviceModel()
  const start = Date.now()
  for (let i = 0; i < COMMANDS; i++) {
    const line = encode(randomCommand(model.state.style))
    const want = model.handle(line)
    const got = await link.exchange(line)
    check(got === want, `#${i} "${line}": reply "${got}", expected "${want}"`)
    d = await dump(link)
    const expected = dumpLine(model.state).replace(/ 0$/, '')
    check(d.state === expected, `#${i} after "${line}": dump "${d.state}" ≠ "${expected}"`)
  }
  console.log(`smoke: ${COMMANDS} random commands verified with ? in ${((Date.now() - start) / 1000).toFixed(1)} s`)

  const bad = await link.exchangeOnce('R 500*00')
  check(bad === 'ERR 1', `bad checksum replied "${bad}"`)
  console.log('smoke: bad checksum → ERR 1')

  // Every style at full rate and its defaults, then with the fastest full-depth LFO sweeping its rate
  // (the LFO's per-frame cost on top of the effect's). Idle for two seconds first so the fps sample isn't
  // dragged down by command traffic.
  const rates: string[] = []
  const lfoRates: string[] = []
  for (const s of STYLES) {
    const params = s.params.map((p) => p.default)
    await link.exchange(encode({ type: 'P', style: s.id, rate: 1000, brightness: 1000, colors: s.defaultColors, params }))
    await sleep(2100)
    d = await dump(link)
    check(d.fps >= MIN_FPS, `${s.name} at full rate runs ${d.fps} fps, below ${MIN_FPS}`)
    rates.push(`${s.name} ${d.fps}`)

    await link.exchange(encode({ type: 'R', rate: 500 }))
    await link.exchange(encode({ type: 'L', on: 1, target: 0, mHz: LFO_MHZ_MAX, depth: 1000 }))
    await sleep(2100)
    d = await dump(link)
    check(d.state.endsWith(` 1 0 ${LFO_MHZ_MAX} 1000`), `${s.name}: LFO not on in "${d.state}"`)
    check(d.fps >= MIN_FPS, `${s.name} with the LFO on its rate runs ${d.fps} fps, below ${MIN_FPS}`)
    lfoRates.push(`${s.name} ${d.fps}`)
  }
  console.log(`smoke: fps at full rate: ${rates.join(', ')}`)
  console.log(`smoke: fps with a 5 Hz full-depth LFO on rate: ${lfoRates.join(', ')}`)

  // A preset load turns the LFO off.
  await link.exchange(encode({ type: 'P', style: 0, rate: 500, brightness: 800, colors: ['#9966CC'], params: [] }))
  d = await dump(link)
  check(d.state.endsWith(` 0 0 ${LFO_MHZ_MAX} 1000`), `P left the LFO on: "${d.state}"`)
  console.log('smoke: P turns the LFO off')

  await disconnect(conn)
  const again = await connect()
  d = await dump(again.link)
  check(d.state === boot, `after reopen, dump "${d.state}" ≠ boot "${boot}"`)
  console.log('smoke: reconnect after reopening the port OK')
  await disconnect(again)
  console.log(`smoke: PASSED on ${PORT_PATH}`)
}

main().catch((err: unknown) => {
  console.error(`smoke: FAILED on ${PORT_PATH}:`, err)
  process.exit(1)
})
