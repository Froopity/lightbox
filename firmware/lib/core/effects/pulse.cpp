#include "pulse.h"

#include "../trig.h"

namespace core {
namespace pulse {

namespace {

// Fractions of the cycle T in 2^32 phase units, from wave.ino's 900 ms womp + 500 ms gap at T = 1400 ms.
// wave.ino's 3 rows start 1.6/14 T apart, so its top row starts 3.2/14 T after the bottom one. The climb keeps
// that span over ROWS rows. Each row glows for thickness/8 mean staggers: 87/8 gives wave.ino's
// waveLen = womp − 3.2/14 T = T·5.8/14, and the 20-row maximum still ends inside the cycle.
constexpr double SPAN_D = 4294967296.0 * 3.2 / 14;
constexpr uint32_t SPAN = (uint32_t)(SPAN_D + 0.5);
constexpr uint32_t EIGHTH_ROW = (uint32_t)(SPAN_D / (ROWS - 1) / 8 + 0.5);  // waveLen per thickness unit
constexpr uint32_t ROW_STEP_Q24 = (uint32_t)(16777216.0 / (ROWS - 1) + 0.5);  // 1/(ROWS − 1) in Q24

// SPAN · w / 2^16 in 32 bits, w ≤ 2^16.
uint32_t spanOf(uint32_t w) { return (SPAN >> 16) * w + (((SPAN & 0xFFFF) * w) >> 16); }

// u = r/(ROWS − 1) in Q16 without a division, rounded: exactly 65536 for the top row.
uint32_t rowU(uint8_t row) { return (row * ROW_STEP_Q24 + 128) >> 8; }

// One frame's constants, so the per-row work has no division.
struct Wave {
  uint32_t waveLen;
  uint32_t angleScale;  // ⌊2^31 / (waveLen >> 16)⌋: angle = (local >> 16) · angleScale >> 24 = 128 · local / waveLen
  uint32_t bowK;        // k in Q16
  int32_t sinK;         // (k/2π)·2^17 with sinSmooth's 2^15 scale, as in lighthouse::theta
  uint8_t shape;

  explicit Wave(const Params& p)
      : waveLen(EIGHTH_ROW * p.thickness),
        angleScale((1UL << 31) / (waveLen >> 16)),
        bowK(p.whip * 65536UL / 100),
        sinK((int32_t)(p.whip * 20861UL / 100)),
        shape(p.shape) {}

  uint32_t climb(uint8_t row) const {
    uint32_t u = rowU(row);
    if (shape == FAST_MIDDLE) return (uint32_t)((int32_t)u + ((sinSmooth((uint16_t)u) * sinK) >> 16));
    uint32_t bow = (((u * (65536 - u)) >> 16) * bowK) >> 16;  // k·u(1 − u)
    return shape == DECELERATE ? u - bow : u + bow;
  }

  uint8_t intensity(uint32_t phase, uint8_t row) const {
    uint32_t start = spanOf(climb(row));
    if (phase < start) return 0;
    uint32_t local = phase - start;
    if (local >= waveLen) return 0;
    // wave.ino's angle = progress·128 / waveLen, truncated. 16-bit precision is plenty for 128 steps.
    return dim8Video(sin8((uint8_t)(((local >> 16) * angleScale) >> 24)));
  }
};

}  // namespace

uint32_t climb(uint8_t row, uint8_t whip, uint8_t shape) { return Wave(Params{8, whip, shape}).climb(row); }

uint8_t intensity(uint32_t phase, uint8_t row, const Params& p) { return Wave(p).intensity(phase, row); }

void render(Frame& f, uint32_t phase, Rgb color, const Params& p) {
  Wave w(p);  // once per frame
  for (uint8_t r = 0; r < ROWS; r++) {
    Rgb c = scale(color, w.intensity(phase, r));
    for (uint8_t col = 0; col < COLS; col++) f.set(r, col, c);
  }
}

}  // namespace pulse
}  // namespace core
