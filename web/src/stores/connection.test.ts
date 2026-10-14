import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { encode } from '../protocol/commands'
import { styleDefaults } from '../presets/preset'
import { styleById } from '../styles/registry'
import { installFakeSerial, removeFakeSerial } from '../testing/installFakeSerial'
import type { FakeSerial } from '../testing/fakeSerial'
import { useConnectionStore } from './connection'
import { useLfoStore } from './lfo'
import { useLiveStore } from './live'

let serial: FakeSerial

function showAlarm(live: ReturnType<typeof useLiveStore>): void {
  const alarm = styleById(1)
  if (!alarm) throw new Error('no style 1')
  live.show(styleDefaults(alarm), null)
}

function stores() {
  const connection = useConnectionStore()
  const live = useLiveStore()
  connection.setResync(live.resyncCommands)
  return { connection, live }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  serial = installFakeSerial()
})
afterEach(removeFakeSerial)

describe('connection store', () => {
  it('is unsupported without Web Serial', async () => {
    removeFakeSerial()
    const { connection } = stores()
    await connection.init()
    expect(connection.status).toBe('unsupported')
  })

  it('stays idle on load when no port has been granted', async () => {
    const { connection } = stores()
    await connection.init()
    expect(connection.status).toBe('idle')
    expect(serial.port.opens).toBe(0)
  })

  it('connects, says hello, resends the full state and verifies it', async () => {
    const { connection } = stores()
    await connection.init()
    await connection.connect()
    expect(connection.status).toBe('connected')
    expect(connection.error).toBeNull()
    const lines = serial.port.device.lines
    expect(lines[0]).toBe(encode({ type: 'H' }))
    expect(lines.slice(-3).map((l) => l[0])).toEqual(['P', 'G', '?'])
    expect(connection.fps).toBe(0)
  })

  it('reconnects silently to a previously granted port', async () => {
    serial.granted = true
    const { connection } = stores()
    await connection.init()
    expect(connection.status).toBe('connected')
  })

  it('ignores a cancelled port picker', async () => {
    const { connection } = stores()
    vi.spyOn(serial, 'requestPort').mockRejectedValue(new DOMException('cancelled', 'NotFoundError'))
    await connection.connect()
    expect(connection.status).toBe('idle')
    expect(connection.error).toBeNull()
  })

  it('reports a board that never answers', async () => {
    serial.port.device.mute = true
    const { connection } = stores()
    await connection.connect()
    expect(connection.status).toBe('idle')
    expect(connection.error).toMatch(/did not answer/)
  })

  it('sends preset loads while connected', async () => {
    const { connection, live } = stores()
    await connection.connect()
    showAlarm(live)
    await vi.waitFor(() => expect(serial.port.device.model.state.style).toBe(1))
    expect(serial.port.device.model.state.colors[0]).toBe('#FF0000')
  })

  it('shows reconnecting after an unplug, then recovers and resends the state', async () => {
    const { connection, live } = stores()
    await connection.connect()
    showAlarm(live)
    await vi.waitFor(() => expect(serial.port.device.model.state.style).toBe(1))
    serial.port.unplug()
    await vi.waitFor(() => expect(connection.status).toBe('reconnecting'))
    serial.port.device.reset() // the replug resets the board (DTR on open does too)
    serial.port.replug()
    await vi.waitFor(() => expect(connection.status).toBe('connected'))
    expect(serial.port.opens).toBe(2)
    expect(serial.port.device.model.state.style).toBe(1)
  })

  it('a running LFO is resent after P and G on reconnect, and the board matches', async () => {
    const { connection, live } = stores()
    await connection.connect()
    showAlarm(live)
    const lfo = useLfoStore()
    lfo.setTarget('rate')
    lfo.setOn(true)
    await vi.waitFor(() => expect(serial.port.device.model.state.lfo).toEqual({ on: 1, target: 0, mHz: 1000, depth: 500 }))
    serial.port.unplug()
    await vi.waitFor(() => expect(connection.status).toBe('reconnecting'))
    serial.port.device.reset()
    serial.port.replug()
    await vi.waitFor(() => expect(connection.status).toBe('connected'))
    expect(connection.error).toBeNull()
    expect(serial.port.device.lines.slice(-4).map((l) => l[0])).toEqual(['P', 'G', 'L', '?'])
    expect(serial.port.device.model.state.lfo.on).toBe(1)
  })

  it('keeps polling for the port when the connect event is missed', async () => {
    const { connection } = stores()
    await connection.connect()
    serial.port.unplug()
    await vi.waitFor(() => expect(connection.status).toBe('reconnecting'))
    serial.port.plugged = true // no event
    await vi.waitFor(() => expect(connection.status).toBe('connected'))
  })

  it('drops commands while offline; the resend covers them', async () => {
    const { connection, live } = stores()
    showAlarm(live)
    expect(serial.port.device.lines).toHaveLength(0)
    await connection.connect()
    expect(serial.port.device.model.state.style).toBe(1)
  })
})
