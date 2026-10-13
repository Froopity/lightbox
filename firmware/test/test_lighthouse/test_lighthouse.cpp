#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

static double refTheta(double phi, double k) { return phi + k / (2 * PI_D) * sin(2 * PI_D * phi); }
static double refBeam(double d, double W) { return fabs(d) < W / 2 ? (1 + cos(PI_D * d / (W / 2))) / 2 : 0; }
static double refGain(double theta, double s) { return (1 - s) + s * pow((1 + cos(2 * PI_D * theta)) / 2, 3); }

static void test_theta_matches_reference() {
  for (uint8_t whip = 0; whip <= 90; whip += 15)
    for (uint32_t i = 0; i < 65536; i += 97) {
      double want = fmod(refTheta(i / 65536.0, whip / 100.0) + 1, 1) * 65536;
      double diff = fabs(want - lighthouse::theta((uint16_t)i, whip));
      if (diff > 32768) diff = 65536 - diff;
      TEST_ASSERT_TRUE(diff < 65536 * 0.004);
    }
}

static void test_theta_monotonic_and_exact_period() {
  for (uint8_t whip = 0; whip <= 90; whip += 5) {
    TEST_ASSERT_EQUAL_UINT16(0, lighthouse::theta(0, whip));
    uint16_t prev = 0;
    for (uint32_t i = 32; i < 65536 + 32; i += 32) {
      uint16_t th = lighthouse::theta((uint16_t)i, whip);
      TEST_ASSERT_TRUE((int16_t)(th - prev) > 0);
      prev = th;
    }
  }
}

static void test_constant_speed_without_whip() {
  for (uint32_t i = 0; i < 65536; i += 13) TEST_ASSERT_EQUAL_UINT16(i, lighthouse::theta((uint16_t)i, 0));
}

static void test_beam_profile() {
  for (uint8_t w = 2; w <= 9; w++)
    for (uint16_t d = 0; d <= 17 * 128; d += 16) TEST_ASSERT_INT_WITHIN(2, toByte(refBeam(d / 256.0, w)), lighthouse::beam(d, w));
  TEST_ASSERT_EQUAL_UINT8(255, lighthouse::beam(0, 5));
}

static void test_flash_gain() {
  for (uint8_t s = 0; s <= 100; s += 25)
    for (uint32_t th = 0; th < 65536; th += 257)
      TEST_ASSERT_INT_WITHIN(2, toByte(refGain(th / 65536.0, s / 100.0)), lighthouse::flashGain((uint16_t)th, s));
  // s = 0: m ≡ 1.
  for (uint32_t th = 0; th < 65536; th += 101) TEST_ASSERT_EQUAL_UINT8(255, lighthouse::flashGain((uint16_t)th, 0));
}

static void test_peak_brightness_at_front_column() {
  const uint8_t fronts[] = {0, 5, 16};
  for (uint8_t front : fronts)
    for (uint8_t flash = 25; flash <= 100; flash += 75) {
      lighthouse::Params p{60, flash, 5, front};
      int best = -1, bestCol = -1;
      for (uint32_t i = 0; i < 65536; i += 7)
        for (uint8_t c = 0; c < COLS; c++) {
          int v = lighthouse::intensity(i << 16, c, p);
          if (v > best) best = v, bestCol = c;
        }
      TEST_ASSERT_EQUAL_INT(front, bestCol);
      TEST_ASSERT_EQUAL_INT(255, best);
    }
}

static void test_beam_centre_and_direction() {
  // Phase 0: the beam is centred on the front column and moves towards increasing columns.
  lighthouse::Params p{0, 0, 3, 4};
  TEST_ASSERT_EQUAL_UINT8(255, lighthouse::intensity(0, 4, p));
  TEST_ASSERT_EQUAL_UINT8(0, lighthouse::intensity(0, 6, p));
  uint32_t later = phaseOf(1.0 / 17);  // one column on
  TEST_ASSERT_EQUAL_UINT8(255, lighthouse::intensity(later, 5, p));
  // Wraps: front 16, a quarter-column on, column 0 is nearer than column 15.
  lighthouse::Params q{0, 0, 3, 16};
  uint32_t q4 = phaseOf(0.25 / 17);
  TEST_ASSERT_TRUE(lighthouse::intensity(q4, 0, q) > lighthouse::intensity(q4, 15, q));
}

static void test_render_rows_identical() {
  TestFrame t;
  lighthouse::Params p{60, 50, 5, 0};
  uint32_t phase = phaseOf(0.1);
  lighthouse::render(t.f, phase, rgbFrom(0xFFFFFF), p);
  for (uint8_t c = 0; c < COLS; c++)
    for (uint8_t r = 0; r < ROWS; r++) TEST_ASSERT_EQUAL_UINT8(lighthouse::intensity(phase, c, p), t.f.get(r, c).r);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_theta_matches_reference);
  RUN_TEST(test_theta_monotonic_and_exact_period);
  RUN_TEST(test_constant_speed_without_whip);
  RUN_TEST(test_beam_profile);
  RUN_TEST(test_flash_gain);
  RUN_TEST(test_peak_brightness_at_front_column);
  RUN_TEST(test_beam_centre_and_direction);
  RUN_TEST(test_render_rows_identical);
  return UNITY_END();
}
