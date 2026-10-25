// Alarm (PLAN.md §3.2): 1–6 full-brightness vertical lines evenly spaced round the cylinder (default two, half
// a turn apart) rotating towards increasing columns, hard-stepping from column to column, with an optional fade
// tail behind each.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace alarm {

constexpr uint8_t MAX_BEAMS = 6;

// Column of line i of n, ⌊18φ + 18i/n⌋ mod 18.
uint8_t headColumn(uint32_t phase, uint8_t line, uint8_t beams);
// Profile f(d) as 0..255 for d whole columns behind the head (d < 0 is ahead); tailWire in param units (0.5 col).
uint8_t profile(int8_t d, uint8_t tailWire);
// I(c) = max over the lines.
uint8_t intensity(uint32_t phase, uint8_t col, uint8_t tailWire, uint8_t beams);
void render(Frame& f, uint32_t phase, Rgb color, uint8_t tailWire, uint8_t beams);

}  // namespace alarm
}  // namespace core
