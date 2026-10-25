#include "lighthouse.h"

#include "../trig.h"

namespace core {
namespace lighthouse {

namespace {

constexpr uint16_t TURN = COLS * 256;  // one revolution in 1/256 columns

// Beam centre x = (18θ + front) mod 18, in 1/256 columns.
uint16_t centre(uint16_t th, uint8_t front) { return (uint16_t)((((uint32_t)th * COLS >> 8) + front * 256) % TURN); }

// beam() with 2^16/W precomputed: angle = d · 2^16 / (256·W) = d · angleScale / 256.
uint8_t beamScaled(uint16_t d, uint8_t width, uint16_t angleScale) {
  if (2 * (uint32_t)d >= 256u * width) return 0;
  uint16_t angle = (uint16_t)(((uint32_t)d * angleScale) >> 8);
  return (uint8_t)((65534 - raisedCos16(angle)) >> 8);
}

// One frame's beams: centre (1/256 columns) and flash gain of each.
struct Beams {
  uint8_t n;
  uint16_t x[MAX_BEAMS];
  uint8_t gain[MAX_BEAMS];
  uint16_t angleScale;  // 2^16 / W
};

Beams beamsAt(uint32_t phase, const Params& p) {
  Beams b;
  b.n = p.beams < 1 ? 1 : p.beams > MAX_BEAMS ? MAX_BEAMS : p.beams;
  b.angleScale = (uint16_t)(65536UL / p.width);
  uint16_t th = theta((uint16_t)(phase >> 16), p.whip, b.n);
  for (uint8_t i = 0; i < b.n; i++) {
    uint16_t ti = (uint16_t)(th + (uint16_t)(65536UL * i / b.n));
    b.x[i] = centre(ti, p.front);
    b.gain[i] = flashGain(ti, p.flash);
  }
  return b;
}

uint8_t intensityAt(const Beams& b, uint8_t col, uint8_t width) {
  uint8_t best = 0;
  for (uint8_t i = 0; i < b.n; i++) {
    // Circular distance by compare-and-subtract: a modulo or division per column per beam costs frames.
    uint16_t d = (uint16_t)(col * 256 + TURN - b.x[i]);
    if (d >= TURN) d = (uint16_t)(d - TURN);
    if (d > TURN / 2) d = (uint16_t)(TURN - d);
    uint8_t v = scale8(beamScaled(d, width, b.angleScale), b.gain[i]);
    if (v > best) best = v;
  }
  return best;
}

}  // namespace

// Both per-frame curves use sinSmooth: θ must stay monotonic (sin16's slope jumps would make it step back
// slightly at k = 0.9), and the flash must reach exactly full brightness at the front.

uint16_t theta(uint16_t phi, uint8_t whip, uint8_t beams) {
  // (k/2πn)·sin·2^16 with sin = sinSmooth/2^15: sinSmooth·whip·(2^17/2π)/100 / 2^16 / n, and 2^17/2π ≈ 20861.
  // nφ wraps in uint16 just as sin 2πnφ repeats.
  int32_t warp = (sinSmooth((uint16_t)(phi * beams)) * (int32_t)(whip * 20861UL / 100)) >> 16;
  return (uint16_t)(phi + warp / beams);
}

uint8_t flashGain(uint16_t th, uint8_t flash) {
  uint32_t c = (uint32_t)(32768 + cosSmooth(th));  // (1 + cos 2πθ)/2, Q16
  if (c > 65535) c = 65535;                        // so each product below fits in 32 bits
  uint32_t c3 = (((c * c) >> 16) * c) >> 16;
  // 255·(1 − s·(1 − c³)), s = flash/100.
  return (uint8_t)(255 - (255 * (65536 - c3) * flash / 100 + 32768) / 65536);
}

// |d| < W/2 ⇔ 2d < 256·W. Angle πd/(W/2) in uint16 turns is 2^16·d/(256·W).
uint8_t beam(uint16_t d, uint8_t width) { return beamScaled(d, width, (uint16_t)(65536UL / width)); }

uint8_t intensity(uint32_t phase, uint8_t col, const Params& p) { return intensityAt(beamsAt(phase, p), col, p.width); }

void render(Frame& f, uint32_t phase, Rgb color, const Params& p) {
  Beams b = beamsAt(phase, p);  // once per frame, not per column
  for (uint8_t c = 0; c < COLS; c++) f.setColumn(c, scale(color, intensityAt(b, c, p.width)));
}

}  // namespace lighthouse
}  // namespace core
