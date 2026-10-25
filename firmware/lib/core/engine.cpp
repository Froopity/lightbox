#include "engine.h"

#include "effects/alarm.h"
#include "effects/lighthouse.h"
#include "effects/ominous.h"
#include "effects/pulse.h"

namespace core {

void Engine::reset() {
  rate_ = 500;
  brightness_ = 800;
  global_ = WIRE_MAX;
  lfo_ = Lfo();
  loadStyle(STYLE_OMINOUS);
}

void Engine::loadStyle(uint8_t style) {
  style_ = style < STYLE_COUNT ? style : 0;
  def_ = styleDef(style_);
  for (uint8_t i = 0; i < MAX_COLORS; i++) colors_[i] = def_.defaultColors[i];
  for (uint8_t i = 0; i < MAX_PARAMS; i++) params_[i] = def_.params[i].def;
  rates_.build(def_.periodSlowMs, def_.periodFastMs);
  updateInc();
  phase_.reset();
  if (style_ == STYLE_TWOTONE) twotone_.reset();
}

void Engine::tick(uint32_t dtUs) {
  lfo_.advance(dtUs);
  if (lfo_.modulates(Lfo::RATE)) updateInc();
  phase_.advance(dtUs, inc_);
  // Two-tone LEDs run off the base period: this frame's progress in 2^24 units of it.
  if (style_ == STYLE_TWOTONE) twotone_.advance((uint32_t)(((uint64_t)dtUs * inc_) >> 16));
}

void Engine::setRate(uint16_t r) {
  rate_ = r > WIRE_MAX ? WIRE_MAX : r;
  // Only the increment changes, never the phase, so the effect doesn't jump.
  updateInc();
}

void Engine::setLfo(bool on, uint8_t target, uint16_t mHz, uint16_t depth) {
  lfo_.set(on, target, mHz, depth);
  updateInc();
}

void Engine::lfoOff() {
  lfo_.off();
  updateInc();
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
  const uint8_t a0 = (uint8_t)params_[0], a1 = (uint8_t)params_[1], a2 = (uint8_t)params_[2];
  switch (style_) {
    case STYLE_ALARM:
      alarm::render(f, phase_.value, c0, a0, a1);
      break;
    case STYLE_TWOTONE:
      twotone_.render(f, c0, rgbFrom(colors_[1]), a0);
      break;
    case STYLE_PULSE:
      pulse::render(f, phase_.value, c0, pulse::Params{a0, a1, a2});
      break;
    case STYLE_LIGHTHOUSE:
      lighthouse::render(f, phase_.value, c0,
                         lighthouse::Params{a0, a1, a2, (uint8_t)params_[3], (uint8_t)params_[4]});
      break;
    case STYLE_OMINOUS:
    default:
      ominous::render(f, phase_.value, c0, a0);
      break;
  }
}

uint8_t Engine::outputBrightness() const {
  uint16_t b = lfo_.modulates(Lfo::BRIGHTNESS) ? lfo_.apply(brightness_) : brightness_;
  return core::outputBrightness(def_.bMin, def_.bMax, b, global_);
}

}  // namespace core
