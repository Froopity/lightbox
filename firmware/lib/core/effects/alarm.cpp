#include "alarm.h"

namespace core {
namespace alarm {

namespace {

// Tail span L + 1 in fixed-point columns, where L = tailWire · 0.5.
int32_t spanQ8(uint8_t tailWire) { return (int32_t)tailWire * (COL_Q / 2) + COL_Q; }

// Profile with the per-frame reciprocal of the span precomputed: invSpan = 2^28 / span.
uint8_t profileFast(int32_t d, int32_t span, uint32_t invSpan) {
  if (d < -COL_Q || d > span) return 0;
  if (d < 0) return (uint8_t)(((d + COL_Q) * 255 + COL_Q / 2) >> 12);  // leading edge 1 + d
  uint32_t u = ((uint32_t)d * invSpan) >> 12;                           // d / span in Q16
  uint32_t v = u >= 65535 ? 0 : 65535 - u;                       // 1 − d/span in Q16
  return (uint8_t)((v * v) >> 24);
}

// Circular distance x − c mapped to (−8.5, 8.5] columns. Callers pass d in (−17, 25.5) columns.
int32_t wrapQ8(int32_t d) {
  if (d <= -TURN_Q / 2) d += TURN_Q;
  if (d > TURN_Q / 2) d -= TURN_Q;
  return d;
}

uint8_t columnIntensity(int32_t x0, uint8_t col, int32_t span, uint32_t invSpan) {
  int32_t c = (int32_t)col * COL_Q;
  uint8_t a = profileFast(wrapQ8(x0 - c), span, invSpan);
  uint8_t b = profileFast(wrapQ8(x0 + TURN_Q / 2 - c), span, invSpan);
  return a > b ? a : b;
}

}  // namespace

int32_t head(uint32_t phase) { return (int32_t)(((uint64_t)phase * TURN_Q) >> 32); }

uint8_t profile(int32_t d, uint8_t tailWire) {
  int32_t span = spanQ8(tailWire);
  return profileFast(d, span, ((uint32_t)1 << 28) / (uint32_t)span);
}

uint8_t intensity(uint32_t phase, uint8_t col, uint8_t tailWire) {
  int32_t span = spanQ8(tailWire);
  return columnIntensity(head(phase), col, span, ((uint32_t)1 << 28) / (uint32_t)span);
}

void render(Frame& f, uint32_t phase, Rgb color, uint8_t tailWire) {
  int32_t span = spanQ8(tailWire);
  uint32_t invSpan = ((uint32_t)1 << 28) / (uint32_t)span;
  int32_t x0 = head(phase);
  for (uint8_t c = 0; c < COLS; c++) f.setColumn(c, scale(color, columnIntensity(x0, c, span, invSpan)));
}

}  // namespace alarm
}  // namespace core
