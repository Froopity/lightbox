// Keyboard shortcuts (PLAN.md §5): 1–9 select a preset by list position, B toggles blackout.
// Ignored while typing in a text field, with modifier keys held, or while a dialog is open.
import { onBeforeUnmount, onMounted } from 'vue'
import { useDialogStore } from '../stores/dialog'
import { useEditorStore } from '../stores/editor'
import { useGlobalStore } from '../stores/global'

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'radio', 'range', 'reset', 'submit'])

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)
}

export function useShortcuts(): void {
  const editor = useEditorStore()
  const global = useGlobalStore()
  const dialog = useDialogStore()

  function onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
    if (dialog.request || isTyping(e.target)) return
    if (e.key >= '1' && e.key <= '9' && e.key.length === 1) {
      e.preventDefault()
      void editor.selectIndex(Number(e.key) - 1)
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault()
      global.toggleBlackout()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
