// Line checksum (PLAN.md §4): XOR of every byte before '*', as two uppercase hex digits.
export function checksum(payload: string): string {
  let x = 0
  for (let i = 0; i < payload.length; i++) x ^= payload.charCodeAt(i) & 0xff
  return x.toString(16).toUpperCase().padStart(2, '0')
}

/** Appends `*HH` to a payload. */
export function withChecksum(payload: string): string {
  return `${payload}*${checksum(payload)}`
}
