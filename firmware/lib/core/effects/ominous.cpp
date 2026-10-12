#include "ominous.h"

#include "../trig.h"

namespace core {
namespace ominous {

uint8_t intensity(uint32_t phase) {
  // Trough 26 (≈ 0.1 · 255), swing 230, so the peak lands on 255.
  return (uint8_t)(26 + (((uint32_t)raisedCos16((uint16_t)(phase >> 16)) * 230) >> 16));
}

void render(Frame& f, uint32_t phase, Rgb color) { f.fill(scale(color, intensity(phase))); }

}  // namespace ominous
}  // namespace core
