// Test double for the firmware's serial side: speaks the wake/CTS handshake and answers lines with the
// DeviceModel. Used by unit tests (Link, store) and, via fakeSerial.ts, the Playwright e2e tests.
import { CTS_CHAR, WAKE_BYTE } from '../protocol/commands'
import { DeviceModel } from '../protocol/device'

export class FakeDevice {
  readonly model = new DeviceModel()
  /** Every line received, in order. */
  readonly lines: string[] = []
  /** Delay before each reply, to make the host queue up commands. */
  replyDelayMs = 0
  /** Wake bytes to ignore (simulates a byte lost to a show()). */
  dropWakes = 0
  /** Lines to answer with ERR 1 regardless of content (simulates corruption). */
  corruptLines = 0
  /** Stop answering entirely. */
  mute = false
  private line: string | null = null // null until woken

  constructor(private readonly out: (text: string) => void) {}

  /** Opening the port pulses DTR, which resets the Nano. */
  reset(): void {
    this.model.reset()
    this.line = null
  }

  receive(bytes: Uint8Array): void {
    for (const b of bytes) {
      if (this.mute) continue
      if (this.line === null) {
        if (b !== WAKE_BYTE) continue
        if (this.dropWakes > 0) {
          this.dropWakes--
          continue
        }
        this.line = ''
        this.out(CTS_CHAR)
      } else if (b === WAKE_BYTE) {
        this.out(CTS_CHAR)
      } else if (b === 0x0a) {
        const line = this.line
        this.line = null
        this.lines.push(line)
        const reply = this.corruptLines > 0 ? (this.corruptLines--, 'ERR 1') : this.model.handle(line)
        if (this.replyDelayMs > 0) setTimeout(() => this.out(reply + '\n'), this.replyDelayMs)
        else this.out(reply + '\n')
      } else if (b !== 0x0d) {
        this.line += String.fromCharCode(b)
      }
    }
  }
}

/** A connected stream pair: what the host reads and writes, wired to a FakeDevice. */
export function fakeStreams(): {
  device: FakeDevice
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
  /** Simulates unplugging: the host's read side errors. */
  lose: () => void
} {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const readable = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
  const enc = new TextEncoder()
  const out = (text: string): void => {
    try {
      controller.enqueue(enc.encode(text))
    } catch {
      // stream already closed or errored
    }
  }
  const dev = new FakeDevice(out)
  const writable = new WritableStream<Uint8Array>({ write: (chunk) => dev.receive(chunk) })
  return { device: dev, readable, writable, lose: () => controller.error(new DOMException('The device has been lost.', 'NetworkError')) }
}
