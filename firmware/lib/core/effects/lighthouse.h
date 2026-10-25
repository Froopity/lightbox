// Lighthouse (PLAN.md §3.5): one soft beam sweeping round towards increasing columns, fastest as it
// passes the front ("whip"), optionally brighter there ("flash"). All rows identical.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace lighthouse {

struct Params {
  uint8_t whip;   // k = whip/100, 0..90
  uint8_t flash;  // s = flash/100, 0..100
  uint8_t width;  // W, beam width in columns, 2..9
  uint8_t front;  // column the beam passes fastest and brightest, 0..COLS − 1
};

// Warped angle θ = φ + (k/2π)·sin 2πφ, both as uint16 turns.
uint16_t theta(uint16_t phi, uint8_t whip);
// m = (1 − s) + s·((1 + cos 2πθ)/2)³ as 0..255.
uint8_t flashGain(uint16_t theta, uint8_t flash);
// Beam profile f(d) = (1 + cos(πd/(W/2)))/2 for |d| < W/2, d in 1/256 columns, as 0..255.
uint8_t beam(uint16_t d, uint8_t width);
// I(c) = f(d(c))·m, 0..255.
uint8_t intensity(uint32_t phase, uint8_t col, const Params& p);
void render(Frame& f, uint32_t phase, Rgb color, const Params& p);

}  // namespace lighthouse
}  // namespace core
