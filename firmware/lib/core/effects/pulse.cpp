#include "pulse.h"

#include "../trig.h"

namespace core {
namespace pulse {

namespace {

// Fractions of the cycle T in 2^32 phase units, from wave.ino's 900 ms womp + 500 ms gap at T = 1400 ms:
// stagger = T·1.6/14 between rows, waveLen = womp − 2·stagger = T·5.8/14 for each row's swell.
constexpr uint32_t STAGGER = (uint32_t)(4294967296.0 * 1.6 / 14 + 0.5);
constexpr uint32_t WAVE_LEN = (uint32_t)(4294967296.0 * 5.8 / 14 + 0.5);

}  // namespace

uint8_t intensity(uint32_t phase, uint8_t row) {
  uint32_t start = row * STAGGER;
  if (phase < start) return 0;
  uint32_t local = phase - start;
  if (local >= WAVE_LEN) return 0;
  // wave.ino's angle = progress·128 / waveLen, truncated. 16-bit precision is plenty for 128 steps.
  uint8_t angle = (uint8_t)(((local >> 16) * 128) / (WAVE_LEN >> 16));
  return dim8Video(sin8(angle));
}

void render(Frame& f, uint32_t phase, Rgb color) {
  for (uint8_t r = 0; r < ROWS; r++) {
    Rgb c = scale(color, intensity(phase, r));
    for (uint8_t col = 0; col < COLS; col++) f.set(r, col, c);
  }
}

}  // namespace pulse
}  // namespace core
