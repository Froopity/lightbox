#!/usr/bin/env python3
"""Fail if `pio run` output (stdin) shows RAM > 75% or flash > 85% (PLAN.md §0)."""
import re
import sys

LIMITS = {"RAM": 75.0, "Flash": 85.0}
text = sys.stdin.read()
sys.stdout.write(text)
ok = True
for name, limit in LIMITS.items():
    m = re.search(rf"^{name}:.*?([\d.]+)% \(used (\d+) bytes from (\d+) bytes\)", text, re.M)
    if not m:
        print(f"check_size: no {name} line in build output", file=sys.stderr)
        sys.exit(1)
    pct = float(m.group(1))
    status = "OK" if pct <= limit else "OVER BUDGET"
    print(f"check_size: {name} {pct:.1f}% (limit {limit:.0f}%) {status}")
    ok &= pct <= limit
sys.exit(0 if ok else 1)
