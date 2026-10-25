// Vertical Pulse (PLAN.md §3.4), a port of arduino/wave/wave.ino: each row in turn, bottom to top, swells
// and fades (sin8 over half a turn, through dim8_video), staggered so the wave climbs, then a dark gap.
// Thickness sets how long each row glows (so how many rows glow at once); whip makes the climb uneven.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace pulse {

enum Shape : uint8_t { ACCELERATE = 0, FAST_MIDDLE = 1, DECELERATE = 2 };

struct Params {
  uint8_t thickness;  // band height in 1/8 rows (row glow time / mean stagger), 8..160; 87 = wave.ino
  uint8_t whip;       // k = whip/100, 0..90
  uint8_t shape;      // Shape
};

// Start of row r as a fraction of the climb, w(u) with u = r/(ROWS − 1), Q16 (0..65536). With k = whip/100:
// accelerate u + k·u(1 − u), fast middle u + (k/2π)·sin 2πu, decelerate u − k·u(1 − u). All monotonic for k < 1.
uint32_t climb(uint8_t row, uint8_t whip, uint8_t shape);
// Row r's intensity, 0..255: dim8_video(sin8(128p)) while its local progress p is in [0, 1), else 0.
uint8_t intensity(uint32_t phase, uint8_t row, const Params& p);
void render(Frame& f, uint32_t phase, Rgb color, const Params& p);

}  // namespace pulse
}  // namespace core
