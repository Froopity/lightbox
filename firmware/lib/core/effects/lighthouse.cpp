#include "lighthouse.h"

#include "../trig.h"

namespace core {
namespace lighthouse {

namespace {

constexpr uint16_t TURN = COLS * 256;  // one revolution in 1/256 columns

// Beam centre x = (18θ + front) mod 18, in 1/256 columns.
uint16_t centre(uint16_t th, uint8_t front) { return (uint16_t)((((uint32_t)th * COLS >> 8) + front * 256) % TURN); }

uint8_t intensityAt(uint16_t x, uint8_t gain, uint8_t col, uint8_t width) {
  uint16_t d = (uint16_t)((col * 256 + TURN - x) % TURN);
  if (d > TURN / 2) d = (uint16_t)(TURN - d);
  return scale8(beam(d, width), gain);
}

}  // namespace

// Both per-frame curves use sinSmooth: θ must stay monotonic (sin16's slope jumps would make it step back
// slightly at k = 0.9), and the flash must reach exactly full brightness at the front.

uint16_t theta(uint16_t phi, uint8_t whip) {
  // (k/2π)·sin·2^16 with sin = sinSmooth/2^15: sinSmooth·whip·(2^17/2π)/100 / 2^16, and 2^17/2π ≈ 20861.
  int32_t warp = (sinSmooth(phi) * (int32_t)(whip * 20861UL / 100)) >> 16;
  return (uint16_t)(phi + warp);
}

uint8_t flashGain(uint16_t th, uint8_t flash) {
  uint32_t c = (uint32_t)(32768 + cosSmooth(th));  // (1 + cos 2πθ)/2, Q16
  if (c > 65535) c = 65535;                        // so each product below fits in 32 bits
  uint32_t c3 = (((c * c) >> 16) * c) >> 16;
  // 255·(1 − s·(1 − c³)), s = flash/100.
  return (uint8_t)(255 - (255 * (65536 - c3) * flash / 100 + 32768) / 65536);
}

uint8_t beam(uint16_t d, uint8_t width) {
  // |d| < W/2 ⇔ 2d < 256·W. Angle πd/(W/2) in uint16 turns is 2^16·d/(256·W).
  if (2 * (uint32_t)d >= 256u * width) return 0;
  uint16_t angle = (uint16_t)(((uint32_t)d << 8) / width);
  return (uint8_t)((65534 - raisedCos16(angle)) >> 8);
}

uint8_t intensity(uint32_t phase, uint8_t col, const Params& p) {
  uint16_t th = theta((uint16_t)(phase >> 16), p.whip);
  return intensityAt(centre(th, p.front), flashGain(th, p.flash), col, p.width);
}

void render(Frame& f, uint32_t phase, Rgb color, const Params& p) {
  uint16_t th = theta((uint16_t)(phase >> 16), p.whip);
  uint16_t x = centre(th, p.front);
  uint8_t gain = flashGain(th, p.flash);
  for (uint8_t c = 0; c < COLS; c++) f.setColumn(c, scale(color, intensityAt(x, gain, c, p.width)));
}

}  // namespace lighthouse
}  // namespace core
