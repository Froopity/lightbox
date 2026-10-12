import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import { installFakeSerial, removeFakeSerial } from './testing/installFakeSerial'
import type { FakeSerial } from './testing/fakeSerial'

let serial: FakeSerial

beforeEach(() => {
  setActivePinia(createPinia())
  serial = installFakeSerial()
})
afterEach(removeFakeSerial)

describe('App', () => {
  it('renders the title and a Connect button', async () => {
    const w = mount(App)
    await flushPromises()
    expect(w.text()).toContain('Lightbox')
    expect(w.get('[data-testid="connection-status"]').text()).toBe('Not connected')
    expect(w.find('button').text()).toBe('Connect')
  })

  it('connects from the button and lists every style', async () => {
    const w = mount(App)
    await flushPromises()
    await w.get('button').trigger('click')
    await vi.waitFor(() => expect(w.get('[data-testid="connection-status"]').text()).toBe('Connected'))
    expect(w.findAll('option').map((o) => o.text())).toEqual(['Ominous Glow', 'Alarm'])
    expect(w.find('button').exists()).toBe(false)
  })

  it('switches the effect from the dropdown', async () => {
    serial.granted = true
    const w = mount(App)
    await vi.waitFor(() => expect(w.get('[data-testid="connection-status"]').text()).toBe('Connected'))
    await w.get('select').setValue('1')
    await vi.waitFor(() => expect(serial.port.device.model.state.style).toBe(1))
  })

  it('shows the banner while reconnecting', async () => {
    serial.granted = true
    const w = mount(App)
    await vi.waitFor(() => expect(w.get('[data-testid="connection-status"]').text()).toBe('Connected'))
    serial.port.unplug()
    await vi.waitFor(() => expect(w.find('.banner').exists()).toBe(true))
    expect(w.get('.banner').text()).toBe('Disconnected — reconnecting')
    serial.port.replug()
    await vi.waitFor(() => expect(w.find('.banner').exists()).toBe(false))
  })

  it('says Chrome is required without Web Serial', async () => {
    removeFakeSerial()
    const w = mount(App)
    await flushPromises()
    expect(w.text()).toContain('use Chrome')
  })
})
