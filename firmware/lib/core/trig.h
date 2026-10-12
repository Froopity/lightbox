// Integer trig ported from FastLED (sin16_C). Angles are uint16: 65536 = one turn.
#pragma once
#include <stdint.h>

namespace core {

// sin(2π·theta/65536) · 32767, error < 0.7% of full scale.
inline int16_t sin16(uint16_t theta) {
  static const uint16_t base[] = {0, 6393, 12539, 18204, 23170, 27245, 30273, 32137};
  static const uint8_t slope[] = {49, 48, 44, 38, 31, 23, 14, 4};
  uint16_t offset = (uint16_t)((theta & 0x3FFF) >> 3);  // 0..2047
  if (theta & 0x4000) offset = (uint16_t)(2047 - offset);
  uint8_t section = (uint8_t)(offset / 256);  // 0..7
  uint8_t secoffset8 = (uint8_t)((uint8_t)offset / 2);
  int16_t y = (int16_t)(slope[section] * secoffset8 + base[section]);
  return (theta & 0x8000) ? (int16_t)-y : y;
}

inline int16_t cos16(uint16_t theta) { return sin16((uint16_t)(theta + 16384)); }

// (1 − cos 2π·theta) / 2 as 0..65534: 0 at theta = 0, peak at half a turn.
inline uint16_t raisedCos16(uint16_t theta) { return (uint16_t)(32767 - cos16(theta)); }

}  // namespace core
