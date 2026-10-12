// One command in flight over the wake/CTS handshake (PLAN.md §4):
// wake byte → '!' → line → reply. A bad checksum (ERR 1) or a timeout retries the whole sequence.
// Works over any byte stream pair: WebSerial's port.readable/writable, or Node's via Duplex.toWeb.
import { CTS_CHAR, ErrorCode, WAKE_BYTE } from '../protocol/commands'

export interface LinkOptions {
  wakeTimeoutMs: number
  wakeRetries: number
  replyTimeoutMs: number
  /** Whole-sequence attempts per command (bad checksum or no reply). */
  attempts: number
}

export const DEFAULT_LINK_OPTIONS: LinkOptions = { wakeTimeoutMs: 50, wakeRetries: 5, replyTimeoutMs: 150, attempts: 3 }

/** The firmware rejected the command (ERR 2, 3 or 4); retrying won't help. */
export class CommandError extends Error {
  constructor(
    readonly code: number,
    readonly line: string,
  ) {
    super(`ERR ${code} for "${line}"`)
  }
}

/** No valid reply after every attempt. */
export class LinkTimeoutError extends Error {}

/** The stream ended (port closed or device unplugged). */
export class LinkClosedError extends Error {}

export class Link {
  private buf = ''
  private notify: (() => void) | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>
  private readonly decoder = new TextDecoder('latin1')
  private readonly encoder = new TextEncoder()
  private isClosed = false
  /** Settles when the read side ends, for any reason. */
  readonly closed: Promise<void>

  constructor(
    readable: ReadableStream<Uint8Array>,
    writable: WritableStream<Uint8Array>,
    private readonly opts: LinkOptions = DEFAULT_LINK_OPTIONS,
  ) {
    this.reader = readable.getReader()
    this.writer = writable.getWriter()
    this.closed = this.readLoop()
  }

  get isOpen(): boolean {
    return !this.isClosed
  }

  /** Sends one line (without '\n') and resolves with the reply line. Calls are serialised. */
  exchange(line: string): Promise<string> {
    const run = this.chain.then(() => this.exchangeNow(line))
    this.chain = run.catch(() => undefined)
    return run
  }

  /** Stops reading and releases both stream locks so the port can be closed. */
  async close(): Promise<void> {
    this.isClosed = true
    await this.reader.cancel().catch(() => undefined)
    await this.closed
    this.writer.releaseLock()
  }

  /**
   * One wake → line → reply sequence with no retry. Resolves with the raw reply (including any
   * "ERR n"), or null if the firmware never answered the wake byte or the line. Not serialised.
   */
  async exchangeOnce(line: string): Promise<string | null> {
    if (!(await this.wake())) return null
    await this.write(this.encoder.encode(line + '\n'))
    const reply = await this.take((b) => b.indexOf('\n'), this.opts.replyTimeoutMs)
    return reply === null ? null : reply.replace(/\r?\n$/, '')
  }

  private async exchangeNow(line: string): Promise<string> {
    for (let attempt = 0; attempt < this.opts.attempts; attempt++) {
      const reply = await this.exchangeOnce(line)
      if (reply === null) continue
      const err = /^ERR (\d+)$/.exec(reply)
      if (!err) return reply
      const code = Number(err[1])
      if (code !== ErrorCode.checksum) throw new CommandError(code, line)
    }
    throw new LinkTimeoutError(`no valid reply to "${line}" after ${this.opts.attempts} attempts`)
  }

  private async wake(): Promise<boolean> {
    for (let i = 0; i < this.opts.wakeRetries; i++) {
      this.buf = ''
      await this.write(Uint8Array.of(WAKE_BYTE))
      if ((await this.take((b) => b.indexOf(CTS_CHAR), this.opts.wakeTimeoutMs)) !== null) {
        this.buf = ''
        return true
      }
    }
    return false
  }

  private async write(bytes: Uint8Array): Promise<void> {
    if (this.isClosed) throw new LinkClosedError('link closed')
    await this.writer.write(bytes)
  }

  /** Waits until find(buf) ≥ 0, then consumes through that index. Null on timeout. */
  private async take(find: (b: string) => number, timeoutMs: number): Promise<string | null> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (this.isClosed) throw new LinkClosedError('link closed')
      const at = find(this.buf)
      if (at >= 0) {
        const out = this.buf.slice(0, at + 1)
        this.buf = this.buf.slice(at + 1)
        return out
      }
      const left = deadline - Date.now()
      if (left <= 0) return null
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left)
        this.notify = () => {
          clearTimeout(t)
          resolve()
        }
      })
      this.notify = null
    }
  }

  private async readLoop(): Promise<void> {
    try {
      for (;;) {
        const { value, done } = await this.reader.read()
        if (done) break
        this.buf += this.decoder.decode(value, { stream: true })
        this.notify?.()
      }
    } catch {
      // device lost: treated like a normal end of stream
    } finally {
      this.isClosed = true
      this.reader.releaseLock()
      this.notify?.()
    }
  }
}
