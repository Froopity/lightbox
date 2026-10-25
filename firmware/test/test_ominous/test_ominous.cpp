#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

static double reference(double phi, double D = 0.1) { return D + (1 - D) * (1 - cos(2 * PI_D * phi)) / 2; }

static void test_matches_reference() {
  for (uint8_t floor = 0; floor <= 100; floor += 5)
    for (int i = 0; i < 4096; i++) {
      double phi = i / 4096.0;
      TEST_ASSERT_INT_WITHIN(2, toByte(reference(phi, floor / 100.0)), ominous::intensity(phaseOf(phi), floor));
    }
}

static void test_min_max_over_one_period() {
  const uint8_t floors[] = {0, 10, 50, 100};
  for (uint8_t floor : floors) {
    int lo = 255, hi = 0;
    for (uint32_t i = 0; i < 65536; i++) {
      int v = ominous::intensity(i << 16, floor);
      lo = v < lo ? v : lo;
      hi = v > hi ? v : hi;
    }
    TEST_ASSERT_INT_WITHIN(1, toByte(floor / 100.0), lo);
    TEST_ASSERT_EQUAL_INT(255, hi);  // the peak is full at every floor; 100% is a steady glow
  }
}

static void test_default_floor_is_ten_percent() {
  Engine e;
  e.loadStyle(STYLE_OMINOUS);
  TEST_ASSERT_EQUAL_UINT16(10, e.param(0));
}

static void test_period_is_exact_at_each_rate() {
  const uint16_t rates[] = {0, 250, 500, 1000};
  for (uint16_t r : rates) {
    Engine e;
    e.loadStyle(STYLE_OMINOUS);
    e.setRate(r);
    double periodMs = 8000.0 * pow(1500.0 / 8000.0, r / 1000.0);
    uint32_t steps = (uint32_t)lround(periodMs);  // 1 ms frames
    for (uint32_t i = 0; i < steps; i++) e.tick(1000);
    double phi = phiOf(e.phase());
    double off = phi > 0.5 ? 1 - phi : phi;
    TEST_ASSERT_TRUE(off < 0.001);
  }
}

static void test_rate_change_mid_cycle_does_not_jump() {
  Engine e;
  e.loadStyle(STYLE_OMINOUS);
  e.setRate(0);
  int prev = ominous::intensity(e.phase(), 10);
  for (int ms = 0; ms < 6000; ms++) {
    if (ms == 2000) e.setRate(1000);
    if (ms == 3000) e.setRate(0);
    if (ms == 4000) e.setRate(637);
    e.tick(1000);
    int cur = ominous::intensity(e.phase(), 10);
    TEST_ASSERT_INT_WITHIN(2, prev, cur);
    prev = cur;
  }
}

static void test_render_fills_every_led_identically() {
  TestFrame t;
  ominous::render(t.f, phaseOf(0.5), rgbFrom(0x9966CC), 10);
  for (uint8_t i = 0; i < PIXELS; i++) {
    TEST_ASSERT_EQUAL_UINT8(0x99, t.px[i].r);
    TEST_ASSERT_EQUAL_UINT8(0x66, t.px[i].g);
    TEST_ASSERT_EQUAL_UINT8(0xCC, t.px[i].b);
  }
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_matches_reference);
  RUN_TEST(test_min_max_over_one_period);
  RUN_TEST(test_default_floor_is_ten_percent);
  RUN_TEST(test_period_is_exact_at_each_rate);
  RUN_TEST(test_rate_change_mid_cycle_does_not_jump);
  RUN_TEST(test_render_fills_every_led_identically);
  return UNITY_END();
}
