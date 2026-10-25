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

static void test_share_at_half_is_unchanged() {
  twotone::Share s(50);
  for (uint32_t p = 0; p < 65536; p++) TEST_ASSERT_EQUAL_UINT16(p, s.warp((uint16_t)p));
}

static void test_share_ends_are_solid_colours() {
  twotone::Share c(100), c2(0);
  for (uint32_t p = 0; p < 65536; p += 7) {
    TEST_ASSERT_EQUAL_UINT8(0, twotone::State::mix(c.warp((uint16_t)p)));
    TEST_ASSERT_EQUAL_UINT8(255, twotone::State::mix(c2.warp((uint16_t)p)));
  }
}

static void test_share_is_c_time_fraction() {
  // C's mean share over a cycle, 1 − mix/255, equals the ratio.
  for (uint8_t ratio = 0; ratio <= 100; ratio += 5) {
    twotone::Share s(ratio);
    double c = 0;
    for (uint32_t p = 0; p < 65536; p++) c += 1 - twotone::State::mix(s.warp((uint16_t)p)) / 255.0;
    TEST_ASSERT_INT_WITHIN(5, ratio * 10, (int)lround(c / 65.536));  // per mille
  }
}

static void test_share_continuous_and_at_c_on_the_wrap() {
  // No jumps (so a held LED glides into its swing), and every LED is at C when its phase wraps (re-rolls stay invisible).
  for (uint8_t ratio = 1; ratio < 100; ratio++) {
    twotone::Share s(ratio);
    TEST_ASSERT_EQUAL_UINT8(0, twotone::State::mix(s.warp(0)));
    TEST_ASSERT_TRUE(twotone::State::mix(s.warp(65535)) <= 1);
    int prev = twotone::State::mix(s.warp(0));
    for (uint32_t p = 1; p < 65536; p++) {
      int cur = twotone::State::mix(s.warp((uint16_t)p));
      TEST_ASSERT_INT_WITHIN(2, prev, cur);
      prev = cur;
    }
  }
}

static void test_share_holds_the_favoured_colour() {
  // 75 %: holds at C for half the cycle, from the wrap. 25 %: holds at C2 for half the cycle, centred.
  twotone::Share c(75), c2(25);
  TEST_ASSERT_EQUAL_UINT16(0, c.warp(32767));
  TEST_ASSERT_TRUE(c.warp(32768 + 1000) > 0);
  TEST_ASSERT_EQUAL_UINT16(32768, c2.warp(16384));
  TEST_ASSERT_EQUAL_UINT16(32768, c2.warp(49151));
  TEST_ASSERT_TRUE(c2.warp(16000) < 32768);
  TEST_ASSERT_TRUE(c2.warp(50000) > 32768);
}

static void test_render_applies_the_ratio() {
  Engine e = started(500);
  e.setParam(0, 80);
  TestFrame t;
  e.tick(123000);
  e.render(t.f);
  twotone::Share s(80);
  for (uint8_t i = 0; i < PIXELS; i++)
    TEST_ASSERT_EQUAL_UINT8(blend(C, C2, twotone::State::mix(s.warp(e.twotone().phase(i)))).r, t.px[i].r);
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
  RUN_TEST(test_share_at_half_is_unchanged);
  RUN_TEST(test_share_ends_are_solid_colours);
  RUN_TEST(test_share_is_c_time_fraction);
  RUN_TEST(test_share_continuous_and_at_c_on_the_wrap);
  RUN_TEST(test_share_holds_the_favoured_colour);
  RUN_TEST(test_render_applies_the_ratio);
  RUN_TEST(test_huge_frame_gap_is_clamped);
  return UNITY_END();
}
