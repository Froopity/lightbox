#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

static const Rgb C = rgbFrom(0xFF4000), C2 = rgbFrom(0x8000FF);

static Engine started(uint16_t rate) {
  Engine e;
  e.loadStyle(STYLE_TWOTONE);
  e.setRate(rate);
  return e;
}

static void test_starts_desynchronised() {
  Engine e = started(500);
  uint16_t lo = 0xFFFF, hi = 0;
  for (uint8_t i = 0; i < PIXELS; i++) {
    uint16_t p = e.twotone().phase(i);
    lo = p < lo ? p : lo;
    hi = p > hi ? p : hi;
  }
  TEST_ASSERT_TRUE(hi - lo > 50000);
}

static void test_multipliers_stay_in_bounds_and_spread() {
  // Sample each fresh roll (sampling over time would favour the slow LEDs, which keep theirs longer).
  Engine e = started(1000);
  int lo = 255, hi = 0, n = 0;
  double sum = 0;
  uint16_t prev[PIXELS];
  for (uint8_t i = 0; i < PIXELS; i++) prev[i] = e.twotone().phase(i);
  for (int ms = 0; ms < 120000; ms++) {
    e.tick(1000);
    for (uint8_t i = 0; i < PIXELS; i++) {
      uint16_t cur = e.twotone().phase(i);
      if (cur < prev[i]) {
        int m = e.twotone().multiplier128(i);
        TEST_ASSERT_TRUE(m >= 64 && m <= 192);  // m ∈ [0.5, 1.5]
        lo = m < lo ? m : lo;
        hi = m > hi ? m : hi;
        sum += m, n++;
      }
      prev[i] = cur;
    }
  }
  TEST_ASSERT_TRUE(n > 5000);
  TEST_ASSERT_TRUE(lo <= 68);
  TEST_ASSERT_TRUE(hi >= 188);
  TEST_ASSERT_INT_WITHIN(3, 128, (int)lround(sum / n));  // uniform: mean 1.0
}

static void test_each_led_runs_at_base_times_m() {
  // Base period 1 s at rate 1000. Time one full LED cycle, wrap to wrap, against its multiplier.
  Engine e = started(1000);
  uint8_t i = 7;
  uint16_t prev = e.twotone().phase(i);
  int wraps = 0, start = 0;
  uint8_t m = 0;
  for (int us = 0; us < 4000000 && wraps < 2; us += 100) {
    e.tick(100);
    uint16_t cur = e.twotone().phase(i);
    if (cur < prev) {  // wrapped
      if (wraps == 0) start = us, m = e.twotone().multiplier128(i);
      else TEST_ASSERT_INT_WITHIN(3000, 1000000 * m / 128, us - start);
      wraps++;
    }
    prev = cur;
  }
  TEST_ASSERT_EQUAL_INT(2, wraps);
}

static void test_continuous_across_wraps() {
  // Fastest LEDs: base 1 s · 0.5. Colour moves smoothly at 1 ms frames, and sits at C when it wraps.
  Engine e = started(1000);
  TestFrame a, b;
  e.render(a.f);
  for (int ms = 0; ms < 5000; ms++) {
    uint16_t before[PIXELS];
    for (uint8_t i = 0; i < PIXELS; i++) before[i] = e.twotone().phase(i);
    e.tick(1000);
    e.render(b.f);
    for (uint8_t i = 0; i < PIXELS; i++) {
      TEST_ASSERT_INT_WITHIN(3, a.px[i].r, b.px[i].r);
      TEST_ASSERT_INT_WITHIN(3, a.px[i].b, b.px[i].b);
      if (e.twotone().phase(i) < before[i]) TEST_ASSERT_INT_WITHIN(2, C.r, b.px[i].r);
      a.px[i] = b.px[i];
    }
  }
}

static void test_colour_stays_on_the_c_c2_line() {
  Engine e = started(300);
  TestFrame t;
  for (int ms = 0; ms < 3000; ms += 7) {
    e.tick(7000);
    e.render(t.f);
    for (uint8_t i = 0; i < PIXELS; i++) {
      Rgb want = blend(C, C2, twotone::State::mix(e.twotone().phase(i)));
      TEST_ASSERT_EQUAL_UINT8(want.r, t.px[i].r);
      TEST_ASSERT_EQUAL_UINT8(want.g, t.px[i].g);
      TEST_ASSERT_EQUAL_UINT8(want.b, t.px[i].b);
      // Between the endpoints, channel by channel.
      TEST_ASSERT_TRUE(t.px[i].r <= C.r && t.px[i].r >= C2.r - 1);
      TEST_ASSERT_TRUE(t.px[i].b >= C.b && t.px[i].b <= C2.b);
    }
  }
}

static void test_mix_endpoints() {
  TEST_ASSERT_EQUAL_UINT8(0, twotone::State::mix(0));
  TEST_ASSERT_EQUAL_UINT8(255, twotone::State::mix(32768));
}

static void test_huge_frame_gap_is_clamped() {
  Engine e = started(1000);
  e.tick(60000000);  // a minute in one frame: no overflow, still in bounds
  for (uint8_t i = 0; i < PIXELS; i++) {
    int m = e.twotone().multiplier128(i);
    TEST_ASSERT_TRUE(m >= 64 && m <= 192);
  }
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_starts_desynchronised);
  RUN_TEST(test_multipliers_stay_in_bounds_and_spread);
  RUN_TEST(test_each_led_runs_at_base_times_m);
  RUN_TEST(test_continuous_across_wraps);
  RUN_TEST(test_colour_stays_on_the_c_c2_line);
  RUN_TEST(test_mix_endpoints);
  RUN_TEST(test_huge_frame_gap_is_clamped);
  return UNITY_END();
}
