// Alarm (PLAN.md §3.2): two vertical lines 8.5 columns apart rotating towards increasing columns,
// each with a squared fade tail behind it and a one-column anti-aliased leading edge.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace alarm {

// Fixed-point columns: COL_Q = one column. Fine enough that head quantisation stays well under 1/255.
constexpr int32_t COL_Q = 4096;
constexpr int32_t TURN_Q = 17 * COL_Q;

// Head position of line 0 in fixed-point columns: 17φ.
int32_t head(uint32_t phase);
// Profile f(d) as 0..255 for d in fixed-point columns (d > 0 = behind the head); tailWire in param units (0.5 col).
uint8_t profile(int32_t d, uint8_t tailWire);
// I(c) = max over both heads.
uint8_t intensity(uint32_t phase, uint8_t col, uint8_t tailWire);
void render(Frame& f, uint32_t phase, Rgb color, uint8_t tailWire);

}  // namespace alarm
}  // namespace core
