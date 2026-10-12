// Logical → physical LED mapping (PLAN.md §2.1).
// Calibrated 2026-10-12: bottom = pin 2 (red), middle = pin 3 (green), top = pin 4 (blue);
// LED 0 of each strip lines up vertically; all strips run the same direction; 17 LEDs wrap once.
// Increasing logical column = anticlockwise seen from above (user confirmed this is the desired rotation).
#pragma once
#include <stdint.h>

#define NUM_STRIPS 3
#define LEDS_PER_STRIP 17
#define NUM_LEDS (NUM_STRIPS * LEDS_PER_STRIP)

// Which strip (0=pin2, 1=pin3, 2=pin4) is logical row r (row 0 = bottom).
const uint8_t STRIP_FOR_ROW[NUM_STRIPS] = {0, 1, 2};
// Physical index of logical column 0, per row.
const uint8_t COL_OFFSET[NUM_STRIPS] = {0, 0, 0};
// Physical index runs opposite to the logical column direction.
const bool COL_REVERSED[NUM_STRIPS] = {false, false, false};

// Index into leds[] for logical (row, col).
inline uint8_t ledIndex(uint8_t row, uint8_t col) {
  uint8_t strip = STRIP_FOR_ROW[row];
  uint8_t c = COL_REVERSED[row] ? (uint8_t)(LEDS_PER_STRIP - col) : (uint8_t)(col + LEDS_PER_STRIP);
  uint8_t phys = (uint8_t)((COL_OFFSET[row] + c) % LEDS_PER_STRIP);
  return (uint8_t)(strip * LEDS_PER_STRIP + phys);
}
