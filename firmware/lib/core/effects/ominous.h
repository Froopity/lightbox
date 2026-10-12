// Ominous Glow (PLAN.md §3.1): all LEDs identical, breathing between 25% and 100%.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace ominous {

// I = D + (1 − D)·(1 − cos 2πφ)/2 with D = 0.25, as 0..255.
uint8_t intensity(uint32_t phase);
void render(Frame& f, uint32_t phase, Rgb color);

}  // namespace ominous
}  // namespace core
