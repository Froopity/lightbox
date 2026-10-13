// Records every command the stores send, for store and component unit tests.
import { vi } from 'vitest'
import type { Command } from '../protocol/commands'
import { useConnectionStore } from '../stores/connection'

export function recordSent(): Command[] {
  const sent: Command[] = []
  vi.spyOn(useConnectionStore(), 'send').mockImplementation((c: Command) => void sent.push(c))
  return sent
}
