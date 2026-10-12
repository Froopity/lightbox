// shared/protocol-fixtures.json: golden lines run by both the firmware and the web test suites (PLAN.md §4).
import data from '../../../shared/protocol-fixtures.json'
import type { Command } from './commands'
import type { DeviceState } from './device'

export interface Fixture {
  name: string
  /** Lines applied first, from the boot state; each must reply OK. */
  before?: string[]
  /** When present, encode(cmd) must equal `line`. */
  cmd?: Command
  line: string
  expectReply?: string
  /** The reply is "ERR <n>" and the state is unchanged. */
  expectError?: number
  expectState?: Partial<DeviceState>
}

export const FIXTURES = (data as { fixtures: Fixture[] }).fixtures
export const BOOT_STATE = (data as { boot: DeviceState }).boot
