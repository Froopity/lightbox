#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

static void test_boot_defaults() {
  Engine e;
  TEST_ASSERT_EQUAL_UINT8(STYLE_OMINOUS, e.style());
  TEST_ASSERT_EQUAL_UINT16(500, e.rate());
  TEST_ASSERT_EQUAL_UINT16(800, e.brightness());
  TEST_ASSERT_EQUAL_UINT16(1000, e.global());
  TEST_ASSERT_EQUAL_HEX32(0x9966CC, e.color(0));
  TEST_ASSERT_UINT8_WITHIN(1, 164, e.outputBrightness());
}

static void test_load_style_sets_defaults_and_resets_phase() {
  Engine e;
  e.tick(123456);
  e.loadStyle(STYLE_ALARM);
  TEST_ASSERT_EQUAL_UINT32(0, e.phase());
  TEST_ASSERT_EQUAL_HEX32(0xFF0000, e.color(0));
  TEST_ASSERT_EQUAL_UINT16(0, e.param(0));
  TEST_ASSERT_EQUAL_UINT16(500, e.rate());  // live rate survives a style change
}

static void test_param_clamped_to_style_range() {
  Engine e;
  e.loadStyle(STYLE_ALARM);
  e.setParam(0, 99);
  TEST_ASSERT_EQUAL_UINT16(16, e.param(0));
  e.setParam(1, 0);
  TEST_ASSERT_EQUAL_UINT16(1, e.param(1));  // at least one line
  e.setParam(3, 5);  // Alarm has two params
  TEST_ASSERT_EQUAL_UINT16(0, e.param(3));
}

static void test_controls_clamped() {
  Engine e;
  e.setRate(4000);
  e.setBrightness(4000);
  e.setGlobal(4000);
  TEST_ASSERT_EQUAL_UINT16(1000, e.rate());
  TEST_ASSERT_EQUAL_UINT16(1000, e.brightness());
  TEST_ASSERT_EQUAL_UINT16(1000, e.global());
  e.setGlobal(0);
  TEST_ASSERT_EQUAL_UINT8(0, e.outputBrightness());
}

static void test_rate_change_keeps_phase() {
  Engine e;
  e.tick(777777);
  uint32_t before = e.phase();
  e.setRate(1000);
  TEST_ASSERT_EQUAL_UINT32(before, e.phase());
}

static void test_render_dispatches_on_style() {
  Engine e;
  e.loadStyle(STYLE_ALARM);
  TestFrame t;
  e.render(t.f);
  // Phase 0: line 0 on column 0, line 1 half a turn on, everything else dark.
  for (uint8_t c = 0; c < COLS; c++) TEST_ASSERT_EQUAL_UINT8(c == 0 || c == COLS / 2 ? 255 : 0, t.f.get(2, c).r);
}

static void test_render_dispatches_new_styles() {
  TestFrame t;
  Engine e;
  e.loadStyle(STYLE_PULSE);
  e.render(t.f);  // phase 0: row 0 just starting its swell, rows above still dark
  TEST_ASSERT_EQUAL_UINT16(87, e.param(0));
  TEST_ASSERT_EQUAL_UINT8(scale8(0x66, pulse::intensity(0, 0, pulse::Params{87, 0, 0})), t.f.get(0, 3).g);
  TEST_ASSERT_TRUE(t.f.get(0, 3).g > 0);
  TEST_ASSERT_EQUAL_UINT8(0, t.f.get(1, 3).g);

  e.loadStyle(STYLE_LIGHTHOUSE);
  TEST_ASSERT_EQUAL_UINT16(60, e.param(0));
  TEST_ASSERT_EQUAL_UINT16(5, e.param(2));
  e.render(t.f);  // phase 0: the beam is on the front column (0) at full flash
  TEST_ASSERT_EQUAL_HEX32(0xFFD8A0, e.color(0));
  TEST_ASSERT_EQUAL_UINT8(0xFF, t.f.get(1, 0).r);
  TEST_ASSERT_EQUAL_UINT8(0, t.f.get(1, 8).r);
  e.setParam(4, 2);  // a second beam, half a turn on
  e.render(t.f);
  TEST_ASSERT_TRUE(t.f.get(1, COLS / 2).r > 0);

  e.loadStyle(STYLE_TWOTONE);
  e.render(t.f);
  Rgb want = blend(rgbFrom(0xFF4000), rgbFrom(0x8000FF), twotone::State::mix(e.twotone().phase(COLS + 3)));
  TEST_ASSERT_EQUAL_UINT8(want.b, t.f.get(1, 3).b);  // LED COLS + 3 = row 1, column 3
}

static void test_twotone_reload_rerolls_and_tick_advances() {
  Engine e;
  e.loadStyle(STYLE_TWOTONE);
  uint16_t first = e.twotone().phase(0);
  e.tick(10000);
  TEST_ASSERT_NOT_EQUAL(first, e.twotone().phase(0));
  e.loadStyle(STYLE_TWOTONE);  // P resets effect state: a fresh random start
  TEST_ASSERT_NOT_EQUAL(first, e.twotone().phase(0));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_boot_defaults);
  RUN_TEST(test_load_style_sets_defaults_and_resets_phase);
  RUN_TEST(test_param_clamped_to_style_range);
  RUN_TEST(test_controls_clamped);
  RUN_TEST(test_rate_change_keeps_phase);
  RUN_TEST(test_render_dispatches_on_style);
  RUN_TEST(test_render_dispatches_new_styles);
  RUN_TEST(test_twotone_reload_rerolls_and_tick_advances);
  return UNITY_END();
}
