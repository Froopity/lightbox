// Small promise-based wrapper over `serialport` for the Node scripts (spike, smoke).
import { SerialPort } from 'serialport'

export const PORT_PATH = process.env.LIGHTBOX_PORT ?? '/dev/ttyUSB0'

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class NodeSerial {
  private buf = ''
  private waiter: (() => void) | null = null

  private constructor(readonly port: SerialPort) {
    port.on('data', (d: Buffer) => {
      this.buf += d.toString('latin1')
      this.waiter?.()
    })
  }

  static open(path = PORT_PATH): Promise<NodeSerial> {
    return new Promise((resolve, reject) => {
      const port = new SerialPort({ path, baudRate: 115200 }, (err) => (err ? reject(err) : resolve(new NodeSerial(port))))
    })
  }

  write(data: string | Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port.write(data, (err) => (err ? reject(err) : this.port.drain((e) => (e ? reject(e) : resolve()))))
    })
  }

  /** Discards everything received so far. */
  drain(): void {
    this.buf = ''
  }

  /** Waits for `ch` and consumes everything up to and including it; false on timeout. */
  async waitChar(ch: string, timeoutMs: number): Promise<boolean> {
    return (await this.take((b) => (b.includes(ch) ? b.indexOf(ch) + 1 : -1), timeoutMs)) !== null
  }

  /** Waits for a full line and returns it without the line ending; null on timeout. */
  async readLine(timeoutMs: number): Promise<string | null> {
    const raw = await this.take((b) => (b.includes('\n') ? b.indexOf('\n') + 1 : -1), timeoutMs)
    return raw === null ? null : raw.replace(/[\r\n]+$/, '')
  }

  private async take(find: (b: string) => number, timeoutMs: number): Promise<string | null> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const end = find(this.buf)
      if (end >= 0) {
        const out = this.buf.slice(0, end)
        this.buf = this.buf.slice(end)
        return out
      }
      const left = deadline - Date.now()
      if (left <= 0) return null
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left)
        this.waiter = () => {
          clearTimeout(t)
          resolve()
        }
      })
      this.waiter = null
    }
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => this.port.close((err) => (err ? reject(err) : resolve())))
  }
}
