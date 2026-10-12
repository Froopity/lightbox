// Fake Web Serial (navigator.serial) with one board on it, backed by FakeDevice. Used by store unit tests
// and injected into the page by the Playwright tests (e2e/fixtures.ts bundles this file).
import { FakeDevice } from './fakeDevice'

export class FakePort extends EventTarget implements SerialPort {
  readable: ReadableStream<Uint8Array> | null = null
  writable: WritableStream<Uint8Array> | null = null
  plugged = true
  opens = 0
  readonly device: FakeDevice
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null
  private readonly enc = new TextEncoder()

  constructor() {
    super()
    this.device = new FakeDevice((text) => {
      try {
        this.controller?.enqueue(this.enc.encode(text))
      } catch {
        // closed
      }
    })
  }

  getInfo(): SerialPortInfo {
    return { usbVendorId: 0x1a86, usbProductId: 0x7523 } // CH340
  }

  async open(options: SerialOptions): Promise<void> {
    if (!this.plugged) throw new DOMException('Failed to open serial port.', 'NetworkError')
    if (this.readable) throw new DOMException('The port is already open.', 'InvalidStateError')
    if (options.baudRate !== 115200) throw new Error(`unexpected baud rate ${options.baudRate}`)
    this.opens++
    this.device.reset() // DTR
    this.readable = new ReadableStream<Uint8Array>({ start: (c) => void (this.controller = c) })
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        if (!this.plugged) throw new DOMException('The device has been lost.', 'NetworkError')
        this.device.receive(chunk)
      },
    })
  }

  async close(): Promise<void> {
    if (!this.readable) throw new DOMException('The port is already closed.', 'InvalidStateError')
    if (this.readable.locked || this.writable?.locked) throw new TypeError('Cannot close a port with locked streams.')
    this.readable = this.writable = this.controller = null
  }

  /** The device keeps its state, like the Arduino on external power. */
  unplug(): void {
    this.plugged = false
    this.controller?.error(new DOMException('The device has been lost.', 'NetworkError'))
    this.readable = this.writable = this.controller = null
    this.dispatchEvent(new Event('disconnect'))
  }

  replug(): void {
    this.plugged = true
    this.dispatchEvent(new Event('connect'))
  }
}

export class FakeSerial extends EventTarget implements Serial {
  readonly port = new FakePort()
  /** Whether the user has granted this origin access to the port (Chrome remembers it). */
  granted = false

  constructor() {
    super()
    // In Chrome these bubble from the port to navigator.serial.
    for (const type of ['connect', 'disconnect']) {
      this.port.addEventListener(type, () => this.dispatchEvent(new Event(type)))
    }
  }

  async getPorts(): Promise<SerialPort[]> {
    return this.granted && this.port.plugged ? [this.port] : []
  }

  async requestPort(): Promise<SerialPort> {
    if (!this.port.plugged) throw new DOMException('No port selected by the user.', 'NotFoundError')
    this.granted = true
    return this.port
  }
}
