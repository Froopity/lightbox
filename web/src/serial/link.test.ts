import { describe, expect, it } from 'vitest'
import { encode } from '../protocol/commands'
import { fakeStreams } from '../testing/fakeDevice'
import { CommandError, Link, LinkClosedError, LinkTimeoutError, type LinkOptions } from './link'

const FAST: LinkOptions = { wakeTimeoutMs: 20, wakeRetries: 3, replyTimeoutMs: 30, attempts: 3 }

function setup() {
  const s = fakeStreams()
  return { ...s, link: new Link(s.readable, s.writable, FAST) }
}

describe('Link', () => {
  it('exchanges a line over the wake/CTS handshake', async () => {
    const { link, device } = setup()
    expect(await link.exchange(encode({ type: 'H' }))).toBe('OK lightbox 1')
    expect(await link.exchange(encode({ type: 'G', global: 10 }))).toBe('OK')
    expect(device.lines).toEqual([encode({ type: 'H' }), encode({ type: 'G', global: 10 })])
    expect(device.model.state.global).toBe(10)
  })

  it('retries the wake byte when it is lost', async () => {
    const { link, device } = setup()
    device.dropWakes = 2
    expect(await link.exchange(encode({ type: 'H' }))).toBe('OK lightbox 1')
  })

  it('retries the whole sequence on a bad checksum', async () => {
    const { link, device } = setup()
    device.corruptLines = 2
    expect(await link.exchange(encode({ type: 'R', rate: 3 }))).toBe('OK')
    expect(device.lines).toHaveLength(3)
  })

  it('gives up after every attempt fails', async () => {
    const { link, device } = setup()
    device.corruptLines = 3
    await expect(link.exchange(encode({ type: 'R', rate: 3 }))).rejects.toBeInstanceOf(LinkTimeoutError)
  })

  it('times out when the device never answers', async () => {
    const { link, device } = setup()
    device.mute = true
    await expect(link.exchange(encode({ type: 'H' }))).rejects.toBeInstanceOf(LinkTimeoutError)
  })

  it('does not retry commands the firmware rejects', async () => {
    const { link, device } = setup()
    const err = await link.exchange(encode({ type: 'A', idx: 0, value: 1 })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CommandError)
    expect((err as CommandError).code).toBe(3)
    expect(device.lines).toHaveLength(1)
  })

  it('serialises concurrent exchanges', async () => {
    const { link, device } = setup()
    device.replyDelayMs = 5
    const replies = await Promise.all([1, 2, 3].map((r) => link.exchange(encode({ type: 'R', rate: r }))))
    expect(replies).toEqual(['OK', 'OK', 'OK'])
    expect(device.model.state.rate).toBe(3)
  })

  it('a later exchange still runs after an earlier one fails', async () => {
    const { link } = setup()
    const bad = link.exchange(encode({ type: 'A', idx: 0, value: 1 }))
    const good = link.exchange(encode({ type: 'H' }))
    await expect(bad).rejects.toBeInstanceOf(CommandError)
    expect(await good).toBe('OK lightbox 1')
  })

  it('reports a lost device and rejects further exchanges', async () => {
    const { link, lose } = setup()
    lose()
    await link.closed
    expect(link.isOpen).toBe(false)
    await expect(link.exchange(encode({ type: 'H' }))).rejects.toBeInstanceOf(LinkClosedError)
  })

  it('close releases both stream locks', async () => {
    const { link, readable, writable } = setup()
    await link.close()
    expect(readable.locked).toBe(false)
    expect(writable.locked).toBe(false)
  })
})
