#include "alarm.h"

namespace core {
namespace alarm {

namespace {

// Columns head is ahead of col, in [0, COLS): 0 = on the head, small = just behind it.
uint8_t behind(uint8_t head, uint8_t col) {
  uint8_t d = (uint8_t)(head + COLS - col);  // compare-and-subtract: no modulo per column per line
  return d >= COLS ? (uint8_t)(d - COLS) : d;
}

}  // namespace

uint8_t headColumn(uint32_t phase, uint8_t line, uint8_t beams) {
  // 18n steps of 1/n column per turn; line i is 18i of them (i/n of a turn) ahead of line 0.
  uint8_t step = (uint8_t)(((uint64_t)phase * (COLS * beams)) >> 32);
  return (uint8_t)(((step + COLS * line) / beams) % COLS);
}

uint8_t profile(int8_t d, uint8_t tailWire) {
  if (d == 0) return 255;
  // Tail (1 − d/(L+1))², with L + 1 = (tailWire + 2) half-columns.
  int16_t span = (int16_t)(tailWire + 2), d2 = (int16_t)(2 * d);
  if (d < 0 || d2 >= span) return 0;
  uint16_t v = (uint16_t)(((span - d2) * 255 + span / 2) / span);  // 1 − d/(L+1) as 0..255
  return (uint8_t)((v * v + 127) / 255);
}

namespace {

void findHeads(uint8_t* heads, uint32_t phase, uint8_t& beams) {
  if (beams < 1) beams = 1;
  if (beams > MAX_BEAMS) beams = MAX_BEAMS;
  for (uint8_t i = 0; i < beams; i++) heads[i] = headColumn(phase, i, beams);
}

// f(d) for d = 0..COLS/2, once per frame rather than per column per line (profile() divides).
struct Profile {
  uint8_t v[COLS / 2 + 1];
  explicit Profile(uint8_t tailWire) {
    for (uint8_t d = 0; d <= COLS / 2; d++) v[d] = profile((int8_t)d, tailWire);
  }
};

uint8_t intensityAt(const uint8_t* heads, uint8_t beams, uint8_t col, const Profile& prof) {
  uint8_t best = 0;
  for (uint8_t i = 0; i < beams; i++) {
    uint8_t d = behind(heads[i], col);
    // Anything more than half a turn behind counts as ahead of the line: dark.
    uint8_t v = d <= COLS / 2 ? prof.v[d] : 0;
    if (v > best) best = v;
  }
  return best;
}

}  // namespace

uint8_t intensity(uint32_t phase, uint8_t col, uint8_t tailWire, uint8_t beams) {
  uint8_t heads[MAX_BEAMS];
  findHeads(heads, phase, beams);
  return intensityAt(heads, beams, col, Profile(tailWire));
}

void render(Frame& f, uint32_t phase, Rgb color, uint8_t tailWire, uint8_t beams) {
  uint8_t heads[MAX_BEAMS];
  findHeads(heads, phase, beams);  // once per frame, not per column
  Profile prof(tailWire);
  for (uint8_t c = 0; c < COLS; c++) f.setColumn(c, scale(color, intensityAt(heads, beams, c, prof)));
}

}  // namespace alarm
}  // namespace core
