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
  TEST_ASSERT_EQUAL_UINT16(6, e.param(0));
  TEST_ASSERT_EQUAL_UINT16(500, e.rate());  // live rate survives a style change
}

static void test_param_clamped_to_style_range() {
  Engine e;
  e.loadStyle(STYLE_ALARM);
  e.setParam(0, 99);
  TEST_ASSERT_EQUAL_UINT16(16, e.param(0));
  e.setParam(3, 5);  // Alarm has one param
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
  // Phase 0: head 0 on column 0 (full), column 1 on the leading edge (dark), head 1 between 8 and 9.
  TEST_ASSERT_EQUAL_UINT8(255, t.f.get(0, 0).r);
  TEST_ASSERT_EQUAL_UINT8(0, t.f.get(0, 1).r);
  TEST_ASSERT_TRUE(t.f.get(2, 8).r > 0 && t.f.get(2, 9).r > 0);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_boot_defaults);
  RUN_TEST(test_load_style_sets_defaults_and_resets_phase);
  RUN_TEST(test_param_clamped_to_style_range);
  RUN_TEST(test_controls_clamped);
  RUN_TEST(test_rate_change_keeps_phase);
  RUN_TEST(test_render_dispatches_on_style);
  return UNITY_END();
}
