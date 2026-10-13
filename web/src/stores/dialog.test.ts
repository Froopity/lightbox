import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDialogStore } from './dialog'

beforeEach(() => setActivePinia(createPinia()))

describe('dialog store', () => {
  it('resolves with the answer', async () => {
    const d = useDialogStore()
    const p = d.confirm('Sure?', 'Yes')
    expect(d.request?.message).toBe('Sure?')
    d.answer('ok')
    expect(await p).toBe(true)
    expect(d.request).toBeNull()
  })

  it('a newer question cancels the open one', async () => {
    const d = useDialogStore()
    const first = d.ask('One', [])
    const second = d.ask('Two', [{ label: 'A', value: 'a' }])
    expect(await first).toBeNull()
    d.answer('a')
    expect(await second).toBe('a')
  })
})
