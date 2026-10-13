// Preset model (PLAN.md §5): validation/repair, seeding, the `P` command, and the export file format.
import type { Command } from '../protocol/commands'
import { STYLES, styleByKey } from '../styles/registry'
import { DEFAULT_BRIGHTNESS, DEFAULT_RATE, WIRE_MAX, type StyleSpec } from '../styles/types'

export interface Preset {
  id: string
  name: string
  /** Style key from styles.json. */
  style: string
  /** "#RRGGBB", one per style colour. */
  colors: string[]
  /** Normalised 0..1. */
  rate: number
  /** Normalised 0..1. */
  brightness: number
  /** Wire units, keyed by param key. */
  params: Record<string, number>
}

/** A preset's settings without its identity: what the editor drafts and the board shows. */
export type PresetData = Omit<Preset, 'id'>

export const STORAGE_VERSION = 1
export const EXPORT_APP = 'lightbox'
export const MAX_NAME = 40

export function newId(): string {
  return crypto.randomUUID()
}

function firstStyle(): StyleSpec {
  const s = STYLES[0]
  if (!s) throw new Error('styles.json has no styles')
  return s
}

/** Settings for a style at its defaults. */
export function styleDefaults(style: StyleSpec = firstStyle()): PresetData {
  return {
    name: style.name,
    style: style.key,
    colors: style.defaultColors.map((c) => c.toUpperCase()),
    rate: DEFAULT_RATE / WIRE_MAX,
    brightness: DEFAULT_BRIGHTNESS / WIRE_MAX,
    params: Object.fromEntries(style.params.map((p) => [p.key, p.default])),
  }
}

/** One default preset per style, seeded on first run. */
export function seedPresets(): Preset[] {
  return STYLES.map((s) => ({ id: newId(), ...styleDefaults(s) }))
}

export function clonePreset<T extends PresetData>(p: T): T {
  return { ...p, colors: [...p.colors], params: { ...p.params } }
}

export function samePresetData(a: PresetData, b: PresetData): boolean {
  return (
    a.name === b.name &&
    a.style === b.style &&
    a.rate === b.rate &&
    a.brightness === b.brightness &&
    a.colors.length === b.colors.length &&
    a.colors.every((c, i) => c === b.colors[i]) &&
    Object.keys(a.params).length === Object.keys(b.params).length &&
    Object.entries(a.params).every(([k, v]) => b.params[k] === v)
  )
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback

export function normalizeColor(v: unknown): string | null {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null
}

/**
 * Repairs whatever came out of storage or an import file into a valid preset, or returns null when it
 * can't be (not an object, unknown style). Bad fields fall back to the style's defaults; numbers are
 * clamped to their ranges; params the style doesn't have are dropped.
 */
export function repairPreset(raw: unknown): Preset | null {
  if (!isRecord(raw) || typeof raw.style !== 'string') return null
  const style = styleByKey(raw.style)
  if (!style) return null
  const d = styleDefaults(style)
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_NAME) : ''
  const colors = Array.isArray(raw.colors) ? raw.colors : []
  const params = isRecord(raw.params) ? raw.params : {}
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId(),
    name: name || d.name,
    style: style.key,
    colors: d.colors.map((c, i) => normalizeColor(colors[i]) ?? c),
    rate: clamp01(raw.rate, d.rate),
    brightness: clamp01(raw.brightness, d.brightness),
    params: Object.fromEntries(
      style.params.map((p) => {
        const v = params[p.key]
        const ok = typeof v === 'number' && Number.isFinite(v)
        return [p.key, ok ? Math.min(p.wireMax, Math.max(p.wireMin, Math.round(v))) : p.default]
      }),
    ),
  }
}

/** Repairs a list, dropping what can't be repaired and giving duplicate ids fresh ones. */
export function repairList(raw: unknown[]): Preset[] {
  const seen = new Set<string>()
  const out: Preset[] = []
  for (const r of raw) {
    const p = repairPreset(r)
    if (!p) continue
    if (seen.has(p.id)) p.id = newId()
    seen.add(p.id)
    out.push(p)
  }
  return out
}

/** Reads the localStorage value; null when it is missing or not a v1 presets document. */
export function parseStored(text: string | null): Preset[] | null {
  if (text === null) return null
  try {
    const doc: unknown = JSON.parse(text)
    if (!isRecord(doc) || doc.version !== STORAGE_VERSION || !Array.isArray(doc.presets)) return null
    return repairList(doc.presets)
  } catch {
    return null
  }
}

export function storedDocument(presets: Preset[]): string {
  return JSON.stringify({ version: STORAGE_VERSION, presets })
}

export interface ExportFile {
  app: typeof EXPORT_APP
  version: number
  exportedAt: string
  presets: Preset[]
}

export function exportDocument(presets: Preset[], now = new Date()): ExportFile {
  return { app: EXPORT_APP, version: STORAGE_VERSION, exportedAt: now.toISOString(), presets }
}

export function exportFilename(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `lightbox-presets-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`
}

/** Validates an import file; returns its repaired presets or a message saying what's wrong. */
export function parseImport(text: string): { presets: Preset[] } | { error: string } {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    return { error: 'The file is not valid JSON.' }
  }
  if (!isRecord(doc) || doc.app !== EXPORT_APP || !Array.isArray(doc.presets)) {
    return { error: 'The file is not a Lightbox preset export.' }
  }
  if (doc.version !== STORAGE_VERSION) return { error: `Unsupported export version ${String(doc.version)}.` }
  const presets = repairList(doc.presets)
  if (presets.length === 0) return { error: 'The file has no usable presets.' }
  return { presets }
}

/** The atomic preset load (`P`) for some settings. */
export function presetCommand(p: PresetData): Command {
  const style = styleByKey(p.style) ?? firstStyle()
  return {
    type: 'P',
    style: style.id,
    rate: toWire(p.rate),
    brightness: toWire(p.brightness),
    colors: p.colors,
    params: style.params.map((s) => p.params[s.key] ?? s.default),
  }
}

/** Normalised 0..1 → wire 0..1000. */
export function toWire(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * WIRE_MAX)
}
