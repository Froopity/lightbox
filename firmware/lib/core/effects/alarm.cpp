#include "alarm.h"

namespace core {
namespace alarm {

namespace {

// Columns head is ahead of col, in [0, 17): 0 = on the head, small = just behind it.
uint8_t behind(uint8_t head, uint8_t col) { return (uint8_t)((head + COLS - col) % COLS); }

}  // namespace

uint8_t headColumn(uint32_t phase, uint8_t line) {
  // 34 half-columns per turn; line 1 is 17 half-columns (8.5 columns) ahead of line 0.
  uint8_t half = (uint8_t)(((uint64_t)phase * (2 * COLS)) >> 32);
  if (line) half = (uint8_t)((half + COLS) % (2 * COLS));
  return (uint8_t)(half / 2);
}

uint8_t profile(int8_t d, uint8_t tailWire) {
  if (d == 0) return 255;
  // Tail (1 − d/(L+1))², with L + 1 = (tailWire + 2) half-columns.
  int16_t span = (int16_t)(tailWire + 2), d2 = (int16_t)(2 * d);
  if (d < 0 || d2 >= span) return 0;
  uint16_t v = (uint16_t)(((span - d2) * 255 + span / 2) / span);  // 1 − d/(L+1) as 0..255
  return (uint8_t)((v * v + 127) / 255);
}

uint8_t intensity(uint32_t phase, uint8_t col, uint8_t tailWire) {
  uint8_t a = behind(headColumn(phase, 0), col), b = behind(headColumn(phase, 1), col);
  // Anything more than half a turn behind counts as ahead of the line: dark.
  uint8_t pa = a <= COLS / 2 ? profile((int8_t)a, tailWire) : 0;
  uint8_t pb = b <= COLS / 2 ? profile((int8_t)b, tailWire) : 0;
  return pa > pb ? pa : pb;
}

void render(Frame& f, uint32_t phase, Rgb color, uint8_t tailWire) {
  for (uint8_t c = 0; c < COLS; c++) f.setColumn(c, scale(color, intensity(phase, c, tailWire)));
}

}  // namespace alarm
}  // namespace core
