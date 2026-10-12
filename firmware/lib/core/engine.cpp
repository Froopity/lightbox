#include "engine.h"

#include "effects/alarm.h"
#include "effects/ominous.h"

namespace core {

void Engine::reset() {
  rate_ = 500;
  brightness_ = 800;
  global_ = WIRE_MAX;
  loadStyle(STYLE_OMINOUS);
}

void Engine::loadStyle(uint8_t style) {
  style_ = style < STYLE_COUNT ? style : 0;
  def_ = styleDef(style_);
  for (uint8_t i = 0; i < MAX_COLORS; i++) colors_[i] = def_.defaultColors[i];
  for (uint8_t i = 0; i < MAX_PARAMS; i++) params_[i] = def_.params[i].def;
  rates_.build(def_.periodSlowMs, def_.periodFastMs);
  inc_ = rates_.inc(rate_);
  phase_.reset();
}

void Engine::setRate(uint16_t r) {
  rate_ = r > WIRE_MAX ? WIRE_MAX : r;
  // Only the increment changes, never the phase, so the effect doesn't jump.
  inc_ = rates_.inc(rate_);
}

void Engine::setColor(uint8_t slot, uint32_t rgb) {
  if (slot < MAX_COLORS) colors_[slot] = rgb & 0xFFFFFF;
}

void Engine::setParam(uint8_t idx, uint16_t value) {
  if (idx >= def_.paramCount) return;
  const ParamDef& p = def_.params[idx];
  params_[idx] = value < p.wireMin ? p.wireMin : value > p.wireMax ? p.wireMax : value;
}

void Engine::render(Frame& f) const {
  Rgb c0 = rgbFrom(colors_[0]);
  switch (style_) {
    case STYLE_ALARM:
      alarm::render(f, phase_.value, c0, (uint8_t)params_[0]);
      break;
    case STYLE_OMINOUS:
    default:
      ominous::render(f, phase_.value, c0);
      break;
  }
}

uint8_t Engine::outputBrightness() const {
  return core::outputBrightness(def_.bMin, def_.bMax, brightness_, global_);
}

}  // namespace core
