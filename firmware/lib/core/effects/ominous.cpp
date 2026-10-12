#include "ominous.h"

#include "../trig.h"

namespace core {
namespace ominous {

uint8_t intensity(uint32_t phase) {
  // Trough 64 (= 0.25 · 256), swing 192, so the peak lands on 255.
  return (uint8_t)(64 + (((uint32_t)raisedCos16((uint16_t)(phase >> 16)) * 192) >> 16));
}

void render(Frame& f, uint32_t phase, Rgb color) { f.fill(scale(color, intensity(phase))); }

}  // namespace ominous
}  // namespace core
