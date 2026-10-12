// Shared helpers for the native tests.
#pragma once
#include <math.h>
#include <stdint.h>

#include "core.h"

constexpr double PI_D = 3.14159265358979323846;

inline uint8_t identityIndex(uint8_t row, uint8_t col) { return (uint8_t)(row * core::COLS + col); }

struct TestFrame {
  core::Rgb px[core::PIXELS] = {};
  core::Frame f{px, identityIndex};
};

// φ ∈ [0,1) → uint32 phase.
inline uint32_t phaseOf(double phi) { return (uint32_t)(fmod(phi, 1.0) * 4294967296.0); }
inline double phiOf(uint32_t phase) { return phase / 4294967296.0; }
// Reference intensity [0,1] → byte.
inline int toByte(double i) { return (int)lround(i * 255.0); }
