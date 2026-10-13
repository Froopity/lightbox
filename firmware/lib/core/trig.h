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

// 128 + 127·sin(2π·theta/256), FastLED sin8_C (the AVR assembly version computes the same values).
inline uint8_t sin8(uint8_t theta) {
  static const uint8_t b_m16[] = {0, 49, 49, 41, 90, 27, 117, 10};
  uint8_t offset = theta;
  if (theta & 0x40) offset = (uint8_t)(255 - offset);
  offset &= 0x3F;
  uint8_t secoffset = offset & 0x0F;
  if (theta & 0x40) secoffset++;
  uint8_t s2 = (uint8_t)((offset >> 4) * 2);
  uint8_t mx = (uint8_t)((b_m16[s2 + 1] * secoffset) >> 4);
  int8_t y = (int8_t)(mx + b_m16[s2]);
  if (theta & 0x80) y = (int8_t)-y;
  return (uint8_t)(y + 128);
}

inline int16_t cos16(uint16_t theta) { return sin16((uint16_t)(theta + 16384)); }

// sin(2π·theta/65536) · 32768, from a parabola with a correction term: error < 0.1%, exact at 0 and ±1, and
// its slope never jumps (sin16's does, slightly, at its table sections). Slower than sin16: per frame, not per pixel.
inline int32_t sinSmooth(uint16_t theta) {
  uint32_t x = theta & 0x7FFF;                                       // position in the half turn, Q15
  uint32_t s = (x * (32768 - x)) >> 13;                              // 4x(1 − x), Q15
  uint32_t y = (s * (25395 + ((7373 * s) >> 15))) >> 15;             // s·(0.775 + 0.225·s)
  return theta & 0x8000 ? -(int32_t)y : (int32_t)y;
}

inline int32_t cosSmooth(uint16_t theta) { return sinSmooth((uint16_t)(theta + 16384)); }

// (1 − cos 2π·theta) / 2 as 0..65534: 0 at theta = 0, peak at half a turn.
inline uint16_t raisedCos16(uint16_t theta) { return (uint16_t)(32767 - cos16(theta)); }

}  // namespace core
