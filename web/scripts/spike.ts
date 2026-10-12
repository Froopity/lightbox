// Serial spike (PLAN.md §4): sends checksummed commands to the `spike` firmware while it renders
// Alarm flat-out, naively or with the wake/CTS handshake, and counts what arrives intact.
// Usage: tsx scripts/spike.ts naive|wake [count]. Results are recorded in firmware/NOTES.md.
import { withChecksum } from '../src/protocol/checksum'
import { NodeSerial, sleep } from './node-serial'

const mode = process.argv[2] === 'wake' ? 'wake' : 'naive'
const count = Number(process.argv[3] ?? 2000)

const int = (max: number): number => Math.floor(Math.random() * (max + 1))
const hex6 = (): string => int(0xffffff).toString(16).toUpperCase().padStart(6, '0')

function randomPayload(): string {
  switch (int(5)) {
    case 0: return `R ${int(1000)}`
    case 1: return `B ${int(1000)}`
    case 2: return `G ${int(1000)}`
    case 3: return `C ${int(1)} ${hex6()}`
    case 4: return `A 0 ${int(16)}`
    default: return `P ${int(1)} ${int(1000)} ${int(1000)} ${hex6()} ${hex6()} ${int(16)} 0 0 0`
  }
}

async function sendWake(s: NodeSerial, line: string): Promise<{ reply: string | null; wakeRetries: number }> {
  let wakeRetries = 0
  for (; wakeRetries < 5; wakeRetries++) {
    s.drain()
    await s.write(Uint8Array.of(0x01))
    if (await s.waitChar('!', 50)) break
  }
  if (wakeRetries === 5) return { reply: null, wakeRetries }
  await s.write(line + '\n')
  return { reply: await s.readLine(100), wakeRetries }
}

async function sendNaive(s: NodeSerial, line: string): Promise<string | null> {
  s.drain()
  await s.write(line + '\n')
  return s.readLine(300)
}

async function main(): Promise<void> {
  const s = await NodeSerial.open()
  await sleep(2000)
  s.drain()
  await s.write(mode === 'wake' ? 'w' : 'n')
  console.log(await s.readLine(1000))
  await sleep(1500) // let fps settle

  let ok = 0, corrupt = 0, lost = 0, wakeRetries = 0
  const start = Date.now()
  for (let i = 0; i < count; i++) {
    const payload = randomPayload()
    const line = withChecksum(payload)
    let reply: string | null
    if (mode === 'wake') {
      const r = await sendWake(s, line)
      reply = r.reply
      wakeRetries += r.wakeRetries
    } else {
      reply = await sendNaive(s, line)
    }
    if (reply === null) lost++
    else if (reply === `OK ${payload.length}`) ok++
    else corrupt++
  }
  const secs = (Date.now() - start) / 1000

  // fps while idle (no commands for over a second).
  await sleep(2200)
  let fps: string | null = null
  for (let i = 0; i < 5 && !fps?.startsWith('FPS'); i++) {
    fps = mode === 'wake' ? (await sendWake(s, withChecksum('F'))).reply : await sendNaive(s, withChecksum('F'))
  }
  console.log(
    `${mode}: ${count} commands in ${secs.toFixed(1)} s (${(count / secs).toFixed(0)}/s) → ` +
      `ok ${ok}, corrupt ${corrupt}, lost ${lost}, wake retries ${wakeRetries}; idle ${fps}`,
  )
  await s.close()
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
