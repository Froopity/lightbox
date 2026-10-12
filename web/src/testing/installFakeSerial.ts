// Installs a FakeSerial as navigator.serial with fast timings, for unit tests.
import { connectionTiming } from '../stores/connection'
import { FakeSerial } from './fakeSerial'

export function installFakeSerial(): FakeSerial {
  const serial = new FakeSerial()
  Object.defineProperty(navigator, 'serial', { value: serial, configurable: true })
  Object.assign(connectionTiming, {
    bootDelayMs: 0,
    helloTimeoutMs: 200,
    reconnectPollMs: 10,
    link: { wakeTimeoutMs: 20, wakeRetries: 3, replyTimeoutMs: 30, attempts: 3 },
  })
  return serial
}

export function removeFakeSerial(): void {
  Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true })
}
