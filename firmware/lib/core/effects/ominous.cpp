#include "ominous.h"

#include "../trig.h"

namespace core {
namespace ominous {

uint8_t intensity(uint32_t phase, uint8_t floor) {
  // Trough 255·D rounded (26 at 10%), swing 256 − trough: raisedCos16 peaks at 65534, so the peak lands on 255.
  uint16_t trough = (uint16_t)((255 * floor + 50) / 100);
  return (uint8_t)(trough + (((uint32_t)raisedCos16((uint16_t)(phase >> 16)) * (256 - trough)) >> 16));
}

void render(Frame& f, uint32_t phase, Rgb color, uint8_t floor) { f.fill(scale(color, intensity(phase, floor))); }

}  // namespace ominous
}  // namespace core
