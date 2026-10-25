// Lighthouse (PLAN.md §3.5): 1–4 evenly spaced soft beams sweeping round together towards increasing columns,
// each fastest as it passes the front ("whip"), optionally brighter there ("flash"). All rows identical.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace lighthouse {

struct Params {
  uint8_t whip;   // k = whip/100, 0..90
  uint8_t flash;  // s = flash/100, 0..100
  uint8_t width;  // W, beam width in columns, 2..9
  uint8_t front;  // column the beams pass fastest and brightest, 0..COLS − 1
  uint8_t beams;  // n, 1..MAX_BEAMS, 1/n of a turn apart
};

constexpr uint8_t MAX_BEAMS = 4;

// Warped angle of beam 0, θ = φ + (k/2πn)·sin 2πnφ, both as uint16 turns: the warp repeats every 1/n turn,
// so every beam whips past the front. Beam i is at θ + i/n.
uint16_t theta(uint16_t phi, uint8_t whip, uint8_t beams);
// m = (1 − s) + s·((1 + cos 2πθ)/2)³ as 0..255.
uint8_t flashGain(uint16_t theta, uint8_t flash);
// Beam profile f(d) = (1 + cos(πd/(W/2)))/2 for |d| < W/2, d in 1/256 columns, as 0..255.
uint8_t beam(uint16_t d, uint8_t width);
// I(c) = max over the beams of f(d_i(c))·m_i, 0..255.
uint8_t intensity(uint32_t phase, uint8_t col, const Params& p);
void render(Frame& f, uint32_t phase, Rgb color, const Params& p);

}  // namespace lighthouse
}  // namespace core
