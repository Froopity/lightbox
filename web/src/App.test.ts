import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from './App.vue'
import { installFakeSerial, removeFakeSerial } from './testing/installFakeSerial'
import type { FakeSerial } from './testing/fakeSerial'

let serial: FakeSerial

enableAutoUnmount(afterEach)
const state = () => serial.port.device.model.state
const status = (w: VueWrapper) => w.get('[data-testid="connection-status"]').text()

async function connected(): Promise<VueWrapper> {
  serial.granted = true
  const w = mount(App, { attachTo: document.body })
  await vi.waitFor(() => expect(status(w)).toBe('Connected'))
  return w
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  serial = installFakeSerial()
})
afterEach(() => {
  removeFakeSerial()
  document.body.innerHTML = ''
})

describe('App', () => {
  it('shows the columns from the sketch and a Connect button', async () => {
    const w = mount(App)
    await flushPromises()
    expect(w.findAll('h2').map((h) => h.text())).toEqual(['Presets', 'Edit/Create', 'Brightness'])
    expect(status(w)).toBe('Not connected')
    expect(w.get('.connection button').text()).toBe('Connect')
    expect(w.text()).toContain('✎ a preset or + to create one')
  })

  it('connects from the button and puts the first preset on the board', async () => {
    const w = mount(App)
    await flushPromises()
    await w.get('.connection button').trigger('click')
    await vi.waitFor(() => expect(status(w)).toBe('Connected'))
    expect(state()).toMatchObject({ style: 0, rate: 500, brightness: 800, global: 1000 })
    expect(w.find('.connection button').exists()).toBe(false)
  })

  it('resends the stored global brightness on connect', async () => {
    localStorage.setItem('lightbox.global.v1', '0.4')
    await connected()
    expect(state().global).toBe(400)
  })

  it('selects a preset from its row', async () => {
    const w = await connected()
    await w.findAll('[data-testid="preset-row"]')[1]?.trigger('click')
    await vi.waitFor(() => expect(state().style).toBe(1))
    expect(w.findAll('[role="radio"]').map((r) => r.attributes('aria-checked'))).toEqual(['false', 'true'])
  })

  it('edits a preset live and saves it', async () => {
    const w = await connected()
    await w.get('[aria-label="Edit Alarm"]').trigger('click')
    await vi.waitFor(() => expect(state().style).toBe(1))
    await w.get('input[type="color"]').setValue('#00ff00')
    await vi.waitFor(() => expect(state().colors[0]).toBe('#00FF00'))
    await w.get('input[type="text"]').setValue('Green alarm')
    await w.get('form').trigger('submit')
    expect(w.text()).toContain('Green alarm')
    expect(w.find('form').exists()).toBe(false)
  })

  it('shows the blackout indicator and darkens the board', async () => {
    const w = await connected()
    await w.get('button[aria-pressed]').trigger('click')
    await vi.waitFor(() => expect(state().global).toBe(0))
    expect(w.get('.global [role="status"]').text()).toBe('Blackout')
    expect(w.get('button[aria-pressed]').text()).toBe('Blackout ON')
  })

  it('shows the banner while reconnecting', async () => {
    const w = await connected()
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
