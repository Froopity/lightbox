// Shape of shared/styles.json (PLAN.md §2.4).
export interface ParamSpec {
  key: string
  label: string
  wireMin: number
  wireMax: number
  default: number
  scale: number
  unit?: string
}

export interface StyleSpec {
  id: number
  key: string
  name: string
  colors: number
  periodSlowMs: number
  periodFastMs: number
  bMin: number
  bMax: number
  defaultColors: string[]
  params: ParamSpec[]
}

/** Fixed slot counts on the wire: unused colours/params are sent as 000000 / 0. */
export const MAX_COLORS = 2
export const MAX_PARAMS = 4
/** Normalised controls run 0..WIRE_MAX on the wire (PLAN.md §2.2). */
export const WIRE_MAX = 1000
/** Boot defaults (PLAN.md §0): rate 0.5, brightness 0.8, global 1.0. */
export const DEFAULT_RATE = 500
export const DEFAULT_BRIGHTNESS = 800
export const DEFAULT_GLOBAL = 1000
