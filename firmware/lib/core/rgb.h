// Rgb pixel and 8-bit colour maths, ported from FastLED (FASTLED_SCALE8_FIXED, FASTLED_BLEND_FIXED).
// Not named color.h: lib/core is on the include path and would shadow FastLED's color.h.
#pragma once
#include <stdint.h>

namespace core {

// Same memory layout as FastLED's CRGB (r, g, b), so main.cpp can render straight into leds[].
struct Rgb {
  uint8_t r, g, b;
};

constexpr Rgb rgbFrom(uint32_t c) {
  return Rgb{(uint8_t)(c >> 16), (uint8_t)(c >> 8), (uint8_t)c};
}

// i * scale / 256, where scale 255 maps i to itself (FastLED scale8 with FIXED rounding).
inline uint8_t scale8(uint8_t i, uint8_t scale) {
  return (uint8_t)(((uint16_t)i * (1 + (uint16_t)scale)) >> 8);
}

// Like scale8, but never scales a non-zero value to zero (FastLED scale8_video).
inline uint8_t scale8Video(uint8_t i, uint8_t scale) {
  return (uint8_t)((((uint16_t)i * scale) >> 8) + (i && scale ? 1 : 0));
}

// Squares the curve, for a perceptual fade (FastLED dim8_video).
inline uint8_t dim8Video(uint8_t x) { return scale8Video(x, x); }

// Linear blend from a (amountOfB = 0) towards b (FastLED blend8).
inline uint8_t blend8(uint8_t a, uint8_t b, uint8_t amountOfB) {
  uint16_t partial = (uint16_t)((a << 8) | b);
  partial = (uint16_t)(partial + b * amountOfB - a * amountOfB);
  return (uint8_t)(partial >> 8);
}

// Colour × intensity, intensity 255 = full.
inline Rgb scale(Rgb c, uint8_t intensity) {
  return Rgb{scale8(c.r, intensity), scale8(c.g, intensity), scale8(c.b, intensity)};
}

inline Rgb blend(Rgb a, Rgb b, uint8_t amountOfB) {
  return Rgb{blend8(a.r, b.r, amountOfB), blend8(a.g, b.g, amountOfB), blend8(a.b, b.b, amountOfB)};
}

}  // namespace core
