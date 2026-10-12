# Firmware notes

## Serial spike (Phase 2, 2026-10-12)

PLAN.md §4 asked whether bytes really get lost while `FastLED.show()` has interrupts disabled, and
whether the wake/CTS handshake fixes it.

**Setup.** `env:spike` (`src/spike.cpp`) renders Alarm at the fastest rate (the hungriest effect,
~284 fps) and accepts checksummed lines. `web/scripts/spike.ts` sends 2,000 random real-format commands
(`R`/`B`/`G`/`C`/`A`/`P`, 5–45 bytes) one at a time, waiting for each reply. The firmware replies
`OK <payload length>`, so a reply only counts as intact if the checksum passed *and* no bytes went
missing. Board: CH340 Nano clone, 115200 8N1.

| Mode | OK | Corrupt | Lost | Throughput |
|---|---|---|---|---|
| Naive (bytes read between shows) | 585 | **1,415 (71%)** | 0 | 138 cmd/s |
| Wake/CTS (`0x01` → `!` → line) | **2,000** | 0 | 0 | 131 cmd/s, 0 wake retries |

**Conclusion.** Naive sending is unusable: any line longer than the UART's 2-byte hardware buffer that
overlaps a `show()` loses bytes. The single wake byte always survives (it sits in the UART until
interrupts come back), and once the firmware has answered `!` it stops rendering until the line is
in, so nothing is lost. The handshake costs almost nothing in throughput, because the round trip is
dominated by USB latency and line transmission time. The protocol in PLAN.md §4 stands as written.

Reproduce: `cd firmware && pio run -e spike -t upload`, then `cd web && npx tsx scripts/spike.ts naive`
(or `wake`).
