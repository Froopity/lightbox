// LFO (PLAN.md §6): v' = clamp(v + (δ/2)·sin 2πφ_L, 0, 1), phase reset on turn-on, P turns it off.
#include <string.h>
#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

static void sink(char) {}

static void send(Engine& e, const char* line) {
  TEST_ASSERT_EQUAL(protocol::OK, protocol::handle(line, (uint16_t)strlen(line), e, 0, sink));
}

static void test_tracks_the_sine_reference() {
  // 1 Hz, depth 600 around 500: v' = 500 + 300·sin 2πt.
  Lfo l;
  l.set(true, Lfo::RATE, 1000, 600);
  for (uint32_t t = 0; t < 1000; t++) {
    double want = 500 + 300 * sin(2 * PI_D * t / 1000.0);
    TEST_ASSERT_INT_WITHIN(2, (int)lround(want), l.apply(500));
    l.advance(1000);
  }
}

static void test_full_depth_swings_the_whole_range() {
  Lfo l;
  l.set(true, Lfo::BRIGHTNESS, 1000, 1000);
  l.advance(250000);  // quarter cycle: the peak
  TEST_ASSERT_EQUAL_UINT16(1000, l.apply(500));
  l.advance(500000);  // three quarters: the trough
  TEST_ASSERT_EQUAL_UINT16(0, l.apply(500));
}

static void test_clamps_to_range() {
  Lfo l;
  l.set(true, Lfo::RATE, 1000, 1000);
  l.advance(250000);
  TEST_ASSERT_EQUAL_UINT16(1000, l.apply(900));
  l.advance(500000);
  TEST_ASSERT_EQUAL_UINT16(0, l.apply(100));
  TEST_ASSERT_EQUAL_UINT16(500, l.apply(1000));  // 1000 − 500
}

static void test_period_is_exact() {
  const uint16_t rates[] = {10, 733, 5000};
  for (uint16_t mHz : rates) {
    Lfo l;
    l.set(true, Lfo::RATE, mHz, 500);
    uint32_t periodUs = 1000000000UL / mHz;
    for (uint32_t t = 0; t + 997 <= periodUs; t += 997) l.advance(997);
    l.advance(periodUs % 997);
    // Back at the start, to within 0.01% of a cycle.
    TEST_ASSERT_INT32_WITHIN(1 << 19, 0, (int32_t)l.phase());
  }
}

static void test_turning_on_resets_phase_and_settings_changes_keep_it() {
  Lfo l;
  l.set(true, Lfo::RATE, 1000, 500);
  l.advance(123456);
  uint32_t running = l.phase();
  TEST_ASSERT_NOT_EQUAL(0, running);
  l.set(true, Lfo::BRIGHTNESS, 2000, 800);  // already on: no restart
  TEST_ASSERT_EQUAL_UINT32(running, l.phase());
  l.set(false, Lfo::BRIGHTNESS, 2000, 800);
  l.advance(5000);  // off: doesn't run
  TEST_ASSERT_EQUAL_UINT32(running, l.phase());
  l.set(true, Lfo::BRIGHTNESS, 2000, 800);
  TEST_ASSERT_EQUAL_UINT32(0, l.phase());
  TEST_ASSERT_EQUAL_UINT16(321, l.apply(321));  // offset 0 at φ_L = 0: turning on never jumps
}

static void test_brightness_target_moves_output_only() {
  Engine e;
  uint8_t steady = e.outputBrightness();
  e.setLfo(true, Lfo::BRIGHTNESS, 1000, 400);
  TEST_ASSERT_EQUAL_UINT8(steady, e.outputBrightness());
  PhaseInc inc = e.inc();
  e.tick(250000);  // peak: brightness 800 + 200 = 1000
  TEST_ASSERT_EQUAL_UINT16(800, e.brightness());  // the live value is untouched
  TEST_ASSERT_EQUAL_UINT8(outputBrightness(4, 255, 1000, 1000), e.outputBrightness());
  TEST_ASSERT_EQUAL_UINT32(inc, e.inc());  // rate untouched
}

static void test_rate_target_changes_increment_never_phase() {
  // The main phase must advance by exactly the modulated increment each frame: no jumps.
  Engine e;
  RateMap m;
  StyleDef d = styleDef(STYLE_OMINOUS);
  m.build(d.periodSlowMs, d.periodFastMs);
  e.setLfo(true, Lfo::RATE, 2000, 1000);
  TEST_ASSERT_EQUAL_UINT32(m.inc(500), e.inc());
  uint32_t prev = e.phase();
  PhaseInc lo = 0xFFFFFFFF, hi = 0;
  for (int i = 0; i < 2000; i++) {
    e.tick(1000);
    PhaseInc inc = e.inc();
    lo = inc < lo ? inc : lo;
    hi = inc > hi ? inc : hi;
    uint32_t step = e.phase() - prev;
    // One frame moves the phase by dt · inc (Q8), give or take the carried fraction.
    TEST_ASSERT_UINT32_WITHIN(1, (uint32_t)((1000ULL * inc) >> 8), step);
    prev = e.phase();
  }
  TEST_ASSERT_EQUAL_UINT16(500, e.rate());
  // Full depth reaches both ends (to within a wire unit: 1 ms frames don't land exactly on the peaks).
  TEST_ASSERT_TRUE(lo <= m.inc(1));
  TEST_ASSERT_TRUE(hi >= m.inc(999));
}

static void test_off_restores_the_live_rate() {
  Engine e;
  PhaseInc steady = e.inc();
  e.setLfo(true, Lfo::RATE, 1000, 1000);
  e.tick(250000);
  TEST_ASSERT_NOT_EQUAL(steady, e.inc());
  e.lfoOff();
  TEST_ASSERT_EQUAL_UINT32(steady, e.inc());
  e.tick(10000);
  TEST_ASSERT_EQUAL_UINT32(steady, e.inc());
}

static void test_live_rate_change_while_modulated() {
  Engine e;
  e.setLfo(true, Lfo::RATE, 1000, 200);
  e.tick(250000);  // peak: +100
  e.setRate(300);
  RateMap m;
  StyleDef d = styleDef(STYLE_OMINOUS);
  m.build(d.periodSlowMs, d.periodFastMs);
  TEST_ASSERT_EQUAL_UINT32(m.inc(400), e.inc());
}

static void test_preset_load_turns_it_off() {
  Engine e;
  send(e, "L 1 0 1000 500*79");
  e.tick(250000);
  TEST_ASSERT_TRUE(e.lfo().on());
  send(e, "P 1 250 900 00FF00 000000 6 0 0 0*49");
  TEST_ASSERT_FALSE(e.lfo().on());
  RateMap m;
  StyleDef d = styleDef(STYLE_ALARM);
  m.build(d.periodSlowMs, d.periodFastMs);
  TEST_ASSERT_EQUAL_UINT32(m.inc(250), e.inc());
  e.tick(250000);
  TEST_ASSERT_EQUAL_UINT32(m.inc(250), e.inc());
}

static void test_boot_lfo_is_off() {
  Engine e;
  TEST_ASSERT_FALSE(e.lfo().on());
  TEST_ASSERT_EQUAL_UINT16(0, e.lfo().mHz());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_tracks_the_sine_reference);
  RUN_TEST(test_full_depth_swings_the_whole_range);
  RUN_TEST(test_clamps_to_range);
  RUN_TEST(test_period_is_exact);
  RUN_TEST(test_turning_on_resets_phase_and_settings_changes_keep_it);
  RUN_TEST(test_brightness_target_moves_output_only);
  RUN_TEST(test_rate_target_changes_increment_never_phase);
  RUN_TEST(test_off_restores_the_live_rate);
  RUN_TEST(test_live_rate_change_while_modulated);
  RUN_TEST(test_preset_load_turns_it_off);
  RUN_TEST(test_boot_lfo_is_off);
  return UNITY_END();
}
