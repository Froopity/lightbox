import { describe, expect, it } from 'vitest'
import { encode, type Command } from '../protocol/commands'
import { CommandQueue } from './queue'

/** An exchange that holds each line until released, recording what was sent. */
function gatedExchange() {
  const sent: string[] = []
  const gates: (() => void)[] = []
  const exchange = (line: string): Promise<string> => {
    sent.push(line)
    return new Promise((resolve) => gates.push(() => resolve('OK')))
  }
  const releaseAll = async (): Promise<void> => {
    for (let i = 0; i < 50; i++) {
      gates.splice(0).forEach((g) => g())
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  return { sent, exchange, releaseAll }
}

const R = (rate: number): Command => ({ type: 'R', rate })
const P = (style: number): Command => ({ type: 'P', style, rate: 1, brightness: 2, colors: [], params: [] })

describe('CommandQueue', () => {
  it('sends only the latest value of a burst while busy', async () => {
    const { sent, exchange, releaseAll } = gatedExchange()
    const q = new CommandQueue(exchange)
    const replies = [0, 1, 2, 3, 4, 5].map((r) => q.send(R(r)))
    await releaseAll()
    expect(sent).toEqual([encode(R(0)), encode(R(5))])
    expect(await Promise.all(replies)).toEqual(['OK', 'OK', 'OK', 'OK', 'OK', 'OK'])
  })

  it('keeps different keys separate and in edit order', async () => {
    const { sent, exchange, releaseAll } = gatedExchange()
    const q = new CommandQueue(exchange)
    void q.send({ type: 'G', global: 0 }) // in flight
    void q.send(R(1))
    void q.send({ type: 'C', slot: 0, color: '#000001' })
    void q.send({ type: 'C', slot: 1, color: '#000002' })
    void q.send(R(2))
    await releaseAll()
    expect(sent).toEqual([
      encode({ type: 'G', global: 0 }),
      encode({ type: 'C', slot: 0, color: '#000001' }),
      encode({ type: 'C', slot: 1, color: '#000002' }),
      encode(R(2)),
    ])
  })

  it('a preset load drops older pending live edits but not global', async () => {
    const { sent, exchange, releaseAll } = gatedExchange()
    const q = new CommandQueue(exchange)
    void q.send({ type: 'H' }) // in flight
    void q.send(R(1))
    void q.send({ type: 'G', global: 7 })
    void q.send({ type: 'A', idx: 0, value: 3 })
    void q.send(P(1))
    void q.send({ type: 'B', brightness: 9 }) // newer than the preset: kept
    await releaseAll()
    expect(sent).toEqual([encode({ type: 'H' }), encode({ type: 'G', global: 7 }), encode(P(1)), encode({ type: 'B', brightness: 9 })])
  })

  it('rejects the waiters of a failed command and carries on', async () => {
    let calls = 0
    const q = new CommandQueue(async () => {
      if (calls++ === 0) throw new Error('boom')
      return 'OK'
    })
    await expect(q.send(R(1))).rejects.toThrow('boom')
    expect(await q.send(R(2))).toBe('OK')
  })

  it('clear rejects everything pending', async () => {
    const { exchange } = gatedExchange()
    const q = new CommandQueue(exchange)
    void q.send(R(1)).catch(() => undefined) // in flight, never released
    const pending = q.send({ type: 'G', global: 1 })
    q.clear(new Error('gone'))
    await expect(pending).rejects.toThrow('gone')
    expect(q.size).toBe(0)
  })
})
