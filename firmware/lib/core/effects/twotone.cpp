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
  for (Led& l : leds_) {
    l.speed = rollSpeed();
    l.phase = next();
    l.frac = 0;
  }
}

void State::advance(uint32_t dBase) {
  if (dBase > BASE_CYCLE) dBase = BASE_CYCLE;
  for (Led& l : leds_) {
    // Phase in 2^24 units, plus dBase / m.
    uint32_t p = ((uint32_t)l.phase << 8 | l.frac) + ((dBase * l.speed) >> 7);
    if (p >= BASE_CYCLE) {  // back at C: re-roll, which can't cause a jump
      p &= BASE_CYCLE - 1;
      l.speed = rollSpeed();
    }
    l.phase = (uint16_t)(p >> 8);
    l.frac = (uint8_t)p;
  }
}

uint8_t State::mix(uint16_t phase) { return (uint8_t)(raisedCos16(phase) >> 8); }

void State::render(Frame& f, Rgb c, Rgb c2) const {
  uint8_t i = 0;
  for (uint8_t r = 0; r < ROWS; r++)
    for (uint8_t col = 0; col < COLS; col++, i++) f.set(r, col, blend(c, c2, mix(leds_[i].phase)));
}

}  // namespace twotone
}  // namespace core
