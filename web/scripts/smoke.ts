// Serial smoke test against a real board (PLAN.md §1). Port from LIGHTBOX_PORT, default /dev/ttyUSB0.
// Phase 0: the port opens and the board survives a DTR reset. The protocol checks arrive in Phase 2.
import { SerialPort } from 'serialport'

const path = process.env.LIGHTBOX_PORT ?? '/dev/ttyUSB0'

function open(): Promise<SerialPort> {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate: 115200 }, (err) => (err ? reject(err) : resolve(port)))
  })
}

async function main(): Promise<void> {
  const port = await open()
  await new Promise((r) => setTimeout(r, 2000)) // DTR reset + bootloader
  await new Promise<void>((resolve, reject) => port.close((err) => (err ? reject(err) : resolve())))
  console.log(`smoke: ${path} opened and closed OK`)
}

main().catch((err: unknown) => {
  console.error(`smoke: FAILED on ${path}:`, err)
  process.exit(1)
})
