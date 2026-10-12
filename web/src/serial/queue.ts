// Coalescing command queue (PLAN.md §4): at most one pending command per coalesce key, the newest value
// wins, so a slider drag never queues up. Commands go out one at a time through `exchange`.
import { coalesceKey, encode, type Command } from '../protocol/commands'

interface Pending {
  cmd: Command
  waiters: { resolve: (reply: string) => void; reject: (err: unknown) => void }[]
}

/** A preset load sets these itself, so older pending ones are obsolete. */
const SUPERSEDED_BY_PRESET = (key: string): boolean => key === 'R' || key === 'B' || /^[CA]\d+$/.test(key)

export class CommandQueue {
  private readonly pending = new Map<string, Pending>()
  private running = false

  constructor(private readonly exchange: (line: string) => Promise<string>) {}

  get size(): number {
    return this.pending.size
  }

  /** Queues a command; resolves with the reply to it or to the newer command that replaced it. */
  send(cmd: Command): Promise<string> {
    const key = coalesceKey(cmd)
    const waiters = this.pending.get(key)?.waiters ?? []
    // Re-insert at the end so the queue keeps the order of the latest edits.
    this.pending.delete(key)
    if (cmd.type === 'P') {
      for (const [k, p] of this.pending) {
        if (!SUPERSEDED_BY_PRESET(k)) continue
        waiters.push(...p.waiters)
        this.pending.delete(k)
      }
    }
    const promise = new Promise<string>((resolve, reject) => waiters.push({ resolve, reject }))
    this.pending.set(key, { cmd, waiters })
    void this.pump()
    return promise
  }

  /** Drops everything pending, rejecting its waiters (e.g. on disconnect). */
  clear(reason: unknown): void {
    for (const p of this.pending.values()) for (const w of p.waiters) w.reject(reason)
    this.pending.clear()
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (let next = this.first(); next; next = this.first()) {
        const [key, p] = next
        this.pending.delete(key)
        try {
          const reply = await this.exchange(encode(p.cmd))
          for (const w of p.waiters) w.resolve(reply)
        } catch (err) {
          for (const w of p.waiters) w.reject(err)
        }
      }
    } finally {
      this.running = false
    }
  }

  private first(): [string, Pending] | undefined {
    return this.pending.entries().next().value
  }
}
