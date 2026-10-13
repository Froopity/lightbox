// Vertical Pulse (PLAN.md §3.4), a port of arduino/wave/wave.ino: each row in turn, bottom to top, swells
// and fades (sin8 over half a turn, through dim8_video), staggered so the wave climbs, then a dark gap.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace pulse {

// Row r's intensity, 0..255: dim8_video(sin8(128p)) while its local progress p is in [0, 1), else 0.
uint8_t intensity(uint32_t phase, uint8_t row);
void render(Frame& f, uint32_t phase, Rgb color);

}  // namespace pulse
}  // namespace core
