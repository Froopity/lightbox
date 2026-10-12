// Typed style registry loaded from shared/styles.json, the single source of truth (PLAN.md §2.4).
import data from '../../../shared/styles.json'
import type { StyleSpec } from './types'

export const STYLES: readonly StyleSpec[] = (data as { styles: StyleSpec[] }).styles

export function styleById(id: number): StyleSpec | undefined {
  return STYLES.find((s) => s.id === id)
}

export function styleByKey(key: string): StyleSpec | undefined {
  return STYLES.find((s) => s.key === key)
}

/** Default params in wire units (the encoder pads unused slots). */
export function defaultParams(style: StyleSpec): number[] {
  return style.params.map((p) => p.default)
}
