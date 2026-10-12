#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

static double periodUsOf(PhaseInc inc) { return 1099511627776.0 / inc; }

static void test_phase_completes_one_cycle_per_period() {
  // 8 s period stepped in uneven frames: back at zero (to within a few phase LSBs of 2^32).
  Phase p;
  PhaseInc inc = incForPeriodUs(8000000);
  uint32_t elapsed = 0;
  while (elapsed + 1237 <= 8000000) {
    p.advance(1237, inc);
    elapsed += 1237;
  }
  p.advance(8000000 - elapsed, inc);
  int32_t off = (int32_t)p.value;
  TEST_ASSERT_INT32_WITHIN(1 << 20, 0, off);  // < 0.025% of a cycle
}

static void test_ratemap_endpoints_and_log_midpoint() {
  RateMap m;
  m.build(8000, 1500);
  TEST_ASSERT_FLOAT_WITHIN(20, 8000000, periodUsOf(m.inc(0)));
  TEST_ASSERT_FLOAT_WITHIN(20, 1500000, periodUsOf(m.inc(1000)));
  TEST_ASSERT_FLOAT_WITHIN(20, sqrt(8000000.0 * 1500000.0), periodUsOf(m.inc(500)));
  TEST_ASSERT_EQUAL_UINT32(m.inc(1000), m.inc(5000));  // clamped
}

static void test_ratemap_tracks_formula_and_is_monotonic() {
  RateMap m;
  m.build(2000, 300);
  PhaseInc prev = 0;
  for (uint16_t r = 0; r <= 1000; r++) {
    double ref = 2000000.0 * pow(300.0 / 2000.0, r / 1000.0);
    double got = periodUsOf(m.inc(r));
    TEST_ASSERT_FLOAT_WITHIN(ref * 0.001, ref, got);
    TEST_ASSERT_TRUE(m.inc(r) >= prev);
    prev = m.inc(r);
  }
}

static void test_output_brightness() {
  TEST_ASSERT_EQUAL_UINT8(255, outputBrightness(4, 255, 1000, 1000));
  TEST_ASSERT_EQUAL_UINT8(4, outputBrightness(4, 255, 0, 1000));
  TEST_ASSERT_EQUAL_UINT8(0, outputBrightness(4, 255, 1000, 0));
  TEST_ASSERT_UINT8_WITHIN(1, 4 + 251 / 4, outputBrightness(4, 255, 500, 1000));
  TEST_ASSERT_UINT8_WITHIN(1, 255 / 4, outputBrightness(4, 255, 1000, 500));
  // Boot default: b = 0.8 → 4 + 251·0.64
  TEST_ASSERT_UINT8_WITHIN(1, 164, outputBrightness(4, 255, 800, 1000));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_phase_completes_one_cycle_per_period);
  RUN_TEST(test_ratemap_endpoints_and_log_midpoint);
  RUN_TEST(test_ratemap_tracks_formula_and_is_monotonic);
  RUN_TEST(test_output_brightness);
  return UNITY_END();
}
