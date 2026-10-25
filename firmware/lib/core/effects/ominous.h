// Ominous Glow (PLAN.md §3.1): all LEDs identical, breathing between a floor (param, default 10%) and 100%.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace ominous {

// I = D + (1 − D)·(1 − cos 2πφ)/2 with D = floor/100, as 0..255.
uint8_t intensity(uint32_t phase, uint8_t floor);
void render(Frame& f, uint32_t phase, Rgb color, uint8_t floor);

}  // namespace ominous
}  // namespace core
