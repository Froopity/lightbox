// One modal question at a time (confirmations, Merge/Replace). Rendered by AppDialog.vue.
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export interface DialogButton {
  label: string
  value: string
  kind?: 'primary' | 'danger'
}

export interface DialogRequest {
  message: string
  buttons: DialogButton[]
  /** Label of the button that answers null; null hides it (Esc still answers null). */
  cancel: string | null
  resolve: (value: string | null) => void
}

export const useDialogStore = defineStore('dialog', () => {
  const request = shallowRef<DialogRequest | null>(null)

  /** Resolves with the chosen button's value, or null when cancelled. A newer question cancels an open one. */
  function ask(message: string, buttons: DialogButton[], cancel: string | null = 'Cancel'): Promise<string | null> {
    request.value?.resolve(null)
    return new Promise((resolve) => {
      request.value = { message, buttons, cancel, resolve }
    })
  }

  async function inform(message: string): Promise<void> {
    await ask(message, [{ label: 'OK', value: 'ok', kind: 'primary' }], null)
  }

  async function confirm(message: string, ok: string, kind: DialogButton['kind'] = 'primary'): Promise<boolean> {
    return (await ask(message, [{ label: ok, value: 'ok', kind }])) === 'ok'
  }

  function answer(value: string | null): void {
    const r = request.value
    request.value = null
    r?.resolve(value)
  }

  return { request, ask, inform, confirm, answer }
})
