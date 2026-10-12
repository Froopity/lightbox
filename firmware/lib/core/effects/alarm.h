// Alarm (PLAN.md §3.2): two full-brightness vertical lines 8.5 columns apart rotating towards
// increasing columns, hard-stepping from column to column, with an optional fade tail behind each.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace alarm {

// Column of line 0, ⌊17φ⌋, and of line 1, ⌊17φ + 8.5⌋ mod 17.
uint8_t headColumn(uint32_t phase, uint8_t line);
// Profile f(d) as 0..255 for d whole columns behind the head (d < 0 is ahead); tailWire in param units (0.5 col).
uint8_t profile(int8_t d, uint8_t tailWire);
// I(c) = max over both lines.
uint8_t intensity(uint32_t phase, uint8_t col, uint8_t tailWire);
void render(Frame& f, uint32_t phase, Rgb color, uint8_t tailWire);

}  // namespace alarm
}  // namespace core
