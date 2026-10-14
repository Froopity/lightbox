// Keyboard shortcuts (PLAN.md §5): 1–9 select a preset by list position, B toggles blackout,
// ↑/↓ nudge the live brightness and ←/→ the live rate by 0.05 (0.01 with Shift).
// Ignored while typing in a text field, with modifier keys held, or while a dialog is open.
// Arrows repeat while held and are off while the editor is open (Current is hidden then).
// A focused slider keeps the arrows (it moves itself).
import { onBeforeUnmount, onMounted } from 'vue'
import { useDialogStore } from '../stores/dialog'
import { useEditorStore } from '../stores/editor'
import { useGlobalStore } from '../stores/global'
import { useLiveStore } from '../stores/live'

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'radio', 'range', 'reset', 'submit'])

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)
}

/** [live value, direction] for each arrow key. */
const ARROWS: Record<string, ['rate' | 'brightness', 1 | -1]> = {
  ArrowUp: ['brightness', 1],
  ArrowDown: ['brightness', -1],
  ArrowRight: ['rate', 1],
  ArrowLeft: ['rate', -1],
}

const isSlider = (t: EventTarget | null): boolean => t instanceof HTMLInputElement && t.type === 'range'

export function useShortcuts(): void {
  const editor = useEditorStore()
  const global = useGlobalStore()
  const dialog = useDialogStore()
  const live = useLiveStore()

  function onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
    if (dialog.request || isTyping(e.target)) return
    const arrow = ARROWS[e.key]
    if (arrow) {
      if (editor.isOpen || isSlider(e.target)) return
      e.preventDefault()
      const by = arrow[1] * (e.shiftKey ? 0.01 : 0.05)
      if (arrow[0] === 'rate') live.nudgeRate(by)
      else live.nudgeBrightness(by)
      return
    }
    if (e.repeat) return
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
