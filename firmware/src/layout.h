// Logical → physical LED mapping (PLAN.md §2.1).
// 7 strips × 18 on pins 2–8 (hardware changed 2026-10-25). NOT YET CALIBRATED: identity mapping assumed
// (pin 2 = bottom … pin 8 = top, LED 0 of each strip lined up, all strips the same direction) until the
// calibration gate is re-run (`make calibrate`, then `make verify-layout`).
// The 3 × 17 build was: identity mapping, increasing logical column = anticlockwise seen from above.
#pragma once
#include <stdint.h>

#define NUM_STRIPS 7
#define LEDS_PER_STRIP 18
#define NUM_LEDS (NUM_STRIPS * LEDS_PER_STRIP)

// Which strip (0=pin2 … 6=pin8) is logical row r (row 0 = bottom).
const uint8_t STRIP_FOR_ROW[NUM_STRIPS] = {0, 1, 2, 3, 4, 5, 6};
// Physical index of logical column 0, per row.
const uint8_t COL_OFFSET[NUM_STRIPS] = {0, 0, 0, 0, 0, 0, 0};
// Physical index runs opposite to the logical column direction.
const bool COL_REVERSED[NUM_STRIPS] = {false, false, false, false, false, false, false};

// One WS2812B strip per data pin, pins 2–8, strip s at leds[s · LEDS_PER_STRIP].
#define ADD_STRIPS(leds)                                                        \
  do {                                                                          \
    FastLED.addLeds<WS2812B, 2, GRB>(leds, 0 * LEDS_PER_STRIP, LEDS_PER_STRIP); \
    FastLED.addLeds<WS2812B, 3, GRB>(leds, 1 * LEDS_PER_STRIP, LEDS_PER_STRIP); \
    FastLED.addLeds<WS2812B, 4, GRB>(leds, 2 * LEDS_PER_STRIP, LEDS_PER_STRIP); \
    FastLED.addLeds<WS2812B, 5, GRB>(leds, 3 * LEDS_PER_STRIP, LEDS_PER_STRIP); \
    FastLED.addLeds<WS2812B, 6, GRB>(leds, 4 * LEDS_PER_STRIP, LEDS_PER_STRIP); \
    FastLED.addLeds<WS2812B, 7, GRB>(leds, 5 * LEDS_PER_STRIP, LEDS_PER_STRIP); \
    FastLED.addLeds<WS2812B, 8, GRB>(leds, 6 * LEDS_PER_STRIP, LEDS_PER_STRIP); \
  } while (0)

// Index into leds[] for logical (row, col).
inline uint8_t ledIndex(uint8_t row, uint8_t col) {
  uint8_t strip = STRIP_FOR_ROW[row];
  uint8_t c = COL_REVERSED[row] ? (uint8_t)(LEDS_PER_STRIP - col) : col;
  // offset + c < 2·LEDS_PER_STRIP, so one subtraction wraps it (cheaper than % per pixel on AVR).
  uint8_t phys = (uint8_t)(COL_OFFSET[row] + c);
  if (phys >= LEDS_PER_STRIP) phys = (uint8_t)(phys - LEDS_PER_STRIP);
  return (uint8_t)(strip * LEDS_PER_STRIP + phys);
}
