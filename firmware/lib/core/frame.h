// Logical frame: 7 rows × 18 columns (PLAN.md §2.1). Row 0 is the bottom; columns wrap.
// Effects write through Frame; the pixel buffer and the logical → physical map belong to the caller
// (main.cpp renders straight into FastLED's leds[]; tests use an identity map).
#pragma once
#include <stdint.h>

#include "rgb.h"

namespace core {

constexpr uint8_t ROWS = 7;
constexpr uint8_t COLS = 18;
constexpr uint8_t PIXELS = ROWS * COLS;

struct Frame {
  using IndexFn = uint8_t (*)(uint8_t row, uint8_t col);

  Rgb* px;
  IndexFn index;

  void set(uint8_t row, uint8_t col, Rgb c) { px[index(row, col)] = c; }
  Rgb get(uint8_t row, uint8_t col) const { return px[index(row, col)]; }
  void setColumn(uint8_t col, Rgb c) {
    for (uint8_t r = 0; r < ROWS; r++) set(r, col, c);
  }
  void fill(Rgb c) {
    for (uint8_t i = 0; i < PIXELS; i++) px[i] = c;
  }
};

}  // namespace core
