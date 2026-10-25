#include "twotone.h"

#include "../trig.h"

namespace core {
namespace twotone {

namespace {

constexpr uint32_t BASE_CYCLE = 1UL << 24;

}  // namespace

uint16_t State::next() {
  // xorshift16 (7, 9, 8): period 65535.
  rng_ ^= (uint16_t)(rng_ << 7);
  rng_ ^= (uint16_t)(rng_ >> 9);
  rng_ ^= (uint16_t)(rng_ << 8);
  return rng_;
}

uint8_t State::rollSpeed() {
  // m·128 uniform in 65..192, stored as its reciprocal so advance() needs no division.
  // Rounding up keeps 1/speed inside [0.5, 1.5].
  uint8_t m128 = (uint8_t)(65 + (next() >> 9));
  return (uint8_t)((SPEED_ONE * 128 + m128 - 1) / m128);
}

void State::reset() {
  for (uint8_t i = 0; i < PIXELS; i++) {
    speed_[i] = rollSpeed();
    phase_[i] = next();
  }
}

void State::advance(uint32_t dBase) {
  if (dBase > BASE_CYCLE) dBase = BASE_CYCLE;
  dither_ += 157;
  for (uint8_t i = 0; i < PIXELS; i++) {
    // dBase / m in 2^24 units, rounded (dithered) to the uint16 phase.
    uint32_t p = phase_[i] + ((((dBase * speed_[i]) >> 7) + dither_) >> 8);
    if (p > 0xFFFF) {  // back at C: re-roll, which can't cause a jump
      p &= 0xFFFF;
      speed_[i] = rollSpeed();
    }
    phase_[i] = (uint16_t)p;
  }
}

uint8_t State::mix(uint16_t phase) { return (uint8_t)(raisedCos16(phase) >> 8); }

void State::render(Frame& f, Rgb c, Rgb c2, uint8_t ratio) const {
  Share share(ratio);  // once per frame: one division
  uint8_t i = 0;
  if (share.identity()) {  // 50 %, the default: skip the warp
    for (uint8_t r = 0; r < ROWS; r++)
      for (uint8_t col = 0; col < COLS; col++, i++) f.set(r, col, blend(c, c2, mix(phase_[i])));
    return;
  }
  for (uint8_t r = 0; r < ROWS; r++)
    for (uint8_t col = 0; col < COLS; col++, i++) f.set(r, col, blend(c, c2, mix(share.warp(phase_[i]))));
}

Share::Share(uint8_t ratio) {
  if (ratio > 100) ratio = 100;
  holdC_ = ratio >= 50;
  hold_ = (uint32_t)(holdC_ ? 2 * ratio - 100 : 100 - 2 * ratio) * 65536 / 100;
  uint32_t swing = 65536 - hold_;
  first_ = holdC_ ? hold_ : swing - swing / 2;  // the larger half first, so the second never passes a turn
  // swing is 0 or at least 655, so the Q8 scale fits 16 bits; x · scale_ >> 8 < 2^16 for every x < swing.
  scale_ = swing ? (uint16_t)((1UL << 24) / swing) : 0;
}

uint16_t Share::warp(uint16_t phase) const {
  // 16 × 16 → 32 multiplies: per pixel, so no 32-bit ones.
  if (holdC_) return phase < first_ ? 0 : (uint16_t)(((uint32_t)(uint16_t)(phase - first_) * scale_) >> 8);
  if (phase < first_) return (uint16_t)(((uint32_t)phase * scale_) >> 8);
  uint32_t after = first_ + hold_;  // the second half of the swing starts here
  if (phase < after) return 32768;
  return (uint16_t)(32768 + (((uint32_t)(uint16_t)(phase - after) * scale_) >> 8));
}

}  // namespace twotone
}  // namespace core
