// Injected into the page before the app loads (see fixtures.ts): replaces navigator.serial with a
// FakeSerial and exposes window.__fake so tests can inspect the decoded board state and unplug/replug.
// Granted access survives reloads, as in Chrome.
import type { DeviceState } from '../src/protocol/device'
import { FakeSerial } from '../src/testing/fakeSerial'

export interface FakeApi {
  state: () => DeviceState
  lines: () => string[]
  opens: () => number
  unplug: () => void
  replug: () => void
  setReplyDelay: (ms: number) => void
}

declare global {
  interface Window {
    __fake: FakeApi
  }
}

const GRANTED_KEY = 'fake.serial.granted'
const serial = new FakeSerial()
serial.granted = localStorage.getItem(GRANTED_KEY) === '1'
const request = serial.requestPort.bind(serial)
serial.requestPort = async () => {
  const port = await request()
  localStorage.setItem(GRANTED_KEY, '1')
  return port
}
Object.defineProperty(navigator, 'serial', { value: serial, configurable: true })

const { port } = serial
window.__fake = {
  state: () => structuredClone(port.device.model.state),
  lines: () => [...port.device.lines],
  opens: () => port.opens,
  unplug: () => port.unplug(),
  replug: () => port.replug(),
  setReplyDelay: (ms) => void (port.device.replyDelayMs = ms),
}
