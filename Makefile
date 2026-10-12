# Lightbox. `make check` must pass before every commit (PLAN.md §1).
SHELL := /bin/bash
.SHELLFLAGS := -eo pipefail -c

PIO ?= pio
LIGHTBOX_PORT ?= /dev/ttyUSB0
export LIGHTBOX_PORT

.PHONY: check check-web check-firmware check-gen gen flash demo calibrate verify-layout smoke web-deps

check: check-gen check-web check-firmware

web-deps:
	cd web && [ -d node_modules ] || npm ci

check-gen: web-deps
	cd web && npx tsx scripts/gen-firmware-styles.ts --check
	cd web && npx tsx scripts/gen-firmware-fixtures.ts --check

check-web: web-deps
	cd web && npx eslint .
	cd web && npx vue-tsc -b --noEmit
	cd web && npx vitest run
	cd web && npx playwright test

check-firmware:
	cd firmware && $(PIO) test -e native
	cd firmware && $(PIO) run -e nano | python3 check_size.py

gen: web-deps
	cd web && npx tsx scripts/gen-firmware-styles.ts
	cd web && npx tsx scripts/gen-firmware-fixtures.ts

flash:
	cd firmware && $(PIO) run -e nano -t upload --upload-port $(LIGHTBOX_PORT)

demo:
	cd firmware && $(PIO) run -e demo -t upload --upload-port $(LIGHTBOX_PORT)

calibrate:
	cd firmware && $(PIO) run -e calibrate -t upload --upload-port $(LIGHTBOX_PORT)

verify-layout:
	cd firmware && $(PIO) run -e verify -t upload --upload-port $(LIGHTBOX_PORT)

smoke: flash
	cd web && npx tsx scripts/smoke.ts
