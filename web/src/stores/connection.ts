// Connection to the board over Web Serial (PLAN.md §5): connect, silent reconnect to a granted port,
// banner + automatic reconnect after a disconnect, full state resend, and a `?` check that the board
// matches the UI. Commands go through the coalescing queue.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { encode, PROTOCOL_VERSION, type Command } from '../protocol/commands'
import { DeviceModel, dumpLine } from '../protocol/device'
import { Link, DEFAULT_LINK_OPTIONS, LinkClosedError } from '../serial/link'
import { CommandQueue } from '../serial/queue'

export type ConnectionStatus = 'unsupported' | 'idle' | 'connecting' | 'connected' | 'reconnecting'

/** Overridable by tests. */
export const connectionTiming = {
  /** Opening the port resets the Nano through DTR; wait out the bootloader. */
  bootDelayMs: 2000,
  helloTimeoutMs: 5000,
  reconnectPollMs: 1000,
  link: DEFAULT_LINK_OPTIONS,
}

const HELLO = `OK lightbox ${PROTOCOL_VERSION}`
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))
/** A dump without its trailing fps field. */
const withoutFps = (dump: string): string => dump.slice(0, dump.lastIndexOf(' '))

export const useConnectionStore = defineStore('connection', () => {
  const status = ref<ConnectionStatus>('idle')
  const error = ref<string | null>(null)
  /** Frames per second reported by the board after the last connect. */
  const fps = ref<number | null>(null)

  // Not reactive: live handles on the port.
  let port: SerialPort | null = null
  let link: Link | null = null
  let queue: CommandQueue | null = null
  let resync: () => Command[] = () => []
  let opening = false
  let pollTimer: ReturnType<typeof setInterval> | null = null

  /** Commands that restore the UI's state on a freshly reset board (P, then G, then L if on). */
  function setResync(fn: () => Command[]): void {
    resync = fn
  }

  async function init(): Promise<void> {
    const serial = navigator.serial
    if (!serial) {
      status.value = 'unsupported'
      return
    }
    serial.addEventListener('connect', () => void tryReconnect())
    const [granted] = await serial.getPorts()
    if (granted) await open(granted)
  }

  /** Asks the user to pick the port (needs a user gesture), then opens it. */
  async function connect(): Promise<void> {
    if (!navigator.serial || opening) return
    let picked: SerialPort
    try {
      picked = await navigator.serial.requestPort()
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) error.value = message(e) // else: cancelled
      return
    }
    await open(picked)
  }

  /** Sends a command if a link is up. While offline it is dropped: the resend on connect covers it. */
  function send(cmd: Command): void {
    queue?.send(cmd).catch((e: unknown) => {
      if (!(e instanceof LinkClosedError)) error.value = message(e)
    })
  }

  async function open(p: SerialPort): Promise<void> {
    if (opening) return
    opening = true
    const reconnecting = status.value === 'reconnecting'
    if (!reconnecting) status.value = 'connecting'
    try {
      await p.open({ baudRate: 115200 })
      port = p
      if (!p.readable || !p.writable) throw new Error('port opened without streams')
      const l = (link = new Link(p.readable, p.writable, connectionTiming.link))
      void l.closed.then(() => {
        if (link === l) void lost()
      })
      await sleep(connectionTiming.bootDelayMs)
      await hello(l)
      const q = (queue = new CommandQueue((line) => l.exchange(line)))
      const cmds = resync()
      await Promise.all(cmds.map((c) => q.send(c)))
      await verify(q, cmds)
      status.value = 'connected'
      stopPolling()
    } catch (e) {
      if (!reconnecting) error.value = message(e)
      await teardown()
      status.value = reconnecting ? 'reconnecting' : 'idle'
      if (!reconnecting) stopPolling()
    } finally {
      opening = false
    }
  }

  async function hello(l: Link): Promise<void> {
    const deadline = Date.now() + connectionTiming.helloTimeoutMs
    while (Date.now() < deadline) {
      if ((await l.exchangeOnce(encode({ type: 'H' }))) === HELLO) return
    }
    throw new Error('The board did not answer. Is the Lightbox firmware flashed?')
  }

  async function verify(q: CommandQueue, sent: Command[]): Promise<void> {
    const model = new DeviceModel()
    for (const c of sent) model.handle(encode(c))
    const dump = await q.send({ type: '?' })
    fps.value = Number(dump.slice(dump.lastIndexOf(' ') + 1))
    const expected = withoutFps(dumpLine(model.state))
    error.value = withoutFps(dump) === expected ? null : `Board state doesn't match the UI (board: ${dump})`
  }

  async function lost(): Promise<void> {
    if (opening) return // open() sees the closed link fail and cleans up itself
    await teardown()
    status.value = 'reconnecting'
    if (!pollTimer) pollTimer = setInterval(() => void tryReconnect(), connectionTiming.reconnectPollMs)
  }

  async function tryReconnect(): Promise<void> {
    if (status.value !== 'reconnecting' || opening || !navigator.serial) return
    const [granted] = await navigator.serial.getPorts()
    if (granted) await open(granted)
  }

  async function teardown(): Promise<void> {
    queue?.clear(new LinkClosedError('disconnected'))
    queue = null
    const l = link
    link = null
    await l?.close()
    await port?.close().catch(() => undefined) // fails if the device is already gone
    port = null
  }

  function stopPolling(): void {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }

  return { status, error, fps, init, connect, send, setResync }
})
