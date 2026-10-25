#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

static double refTheta(double phi, double k, int n = 1) { return phi + k / (2 * PI_D * n) * sin(2 * PI_D * n * phi); }
static double refBeam(double d, double W) { return fabs(d) < W / 2 ? (1 + cos(PI_D * d / (W / 2))) / 2 : 0; }
static double refGain(double theta, double s) { return (1 - s) + s * pow((1 + cos(2 * PI_D * theta)) / 2, 3); }

static void test_theta_matches_reference() {
  for (uint8_t n = 1; n <= lighthouse::MAX_BEAMS; n++)
    for (uint8_t whip = 0; whip <= 90; whip += 15)
      for (uint32_t i = 0; i < 65536; i += 97) {
        double want = fmod(refTheta(i / 65536.0, whip / 100.0, n) + 1, 1) * 65536;
        double diff = fabs(want - lighthouse::theta((uint16_t)i, whip, n));
        if (diff > 32768) diff = 65536 - diff;
        TEST_ASSERT_TRUE(diff < 65536 * 0.004);
      }
}

static void test_theta_monotonic_and_exact_period() {
  for (uint8_t n = 1; n <= lighthouse::MAX_BEAMS; n++)
    for (uint8_t whip = 0; whip <= 90; whip += 5) {
      TEST_ASSERT_EQUAL_UINT16(0, lighthouse::theta(0, whip, n));
      uint16_t prev = 0;
      for (uint32_t i = 32; i < 65536 + 32; i += 32) {
        uint16_t th = lighthouse::theta((uint16_t)i, whip, n);
        TEST_ASSERT_TRUE((int16_t)(th - prev) > 0);
        prev = th;
      }
    }
}

static void test_whip_fastest_at_every_beam_pass() {
  // With n beams the speed peaks n times a turn, at θ = i/n: each time a beam is on the front.
  // dθ/dφ = 1 + k·cos 2πnφ: 1.9 at φ = i/n, 0.1 halfway between.
  auto speed = [](uint32_t phi, uint8_t n) {
    return (int16_t)(lighthouse::theta((uint16_t)(phi + 64), 90, n) - lighthouse::theta((uint16_t)(phi - 64), 90, n)) / 128.0;
  };
  for (uint8_t n = 1; n <= lighthouse::MAX_BEAMS; n++)
    for (uint8_t i = 0; i < n; i++) {
      TEST_ASSERT_INT_WITHIN(5, 190, (int)lround(100 * speed(65536UL * i / n, n)));
      TEST_ASSERT_INT_WITHIN(5, 10, (int)lround(100 * speed(65536UL * (2 * i + 1) / (2 * n), n)));
    }
}

static void test_constant_speed_without_whip() {
  for (uint8_t n = 1; n <= lighthouse::MAX_BEAMS; n++)
    for (uint32_t i = 0; i < 65536; i += 13) TEST_ASSERT_EQUAL_UINT16(i, lighthouse::theta((uint16_t)i, 0, n));
}

static void test_beams_evenly_spaced() {
  // No whip or flash, narrow beams: at phase 0 beam i is centred on column front + 18i/n.
  for (uint8_t n = 1; n <= lighthouse::MAX_BEAMS; n++) {
    lighthouse::Params p{0, 0, 2, 3, n};
    int lit = 0;
    for (uint8_t c = 0; c < COLS; c++) lit += lighthouse::intensity(0, c, p) > 0;
    TEST_ASSERT_TRUE(lit >= n && lit <= 2 * n);
    for (uint8_t i = 0; i < n; i++) {
      uint8_t col = (uint8_t)((3 + (COLS * i + n / 2) / n) % COLS);  // nearest column to the centre
      TEST_ASSERT_TRUE(lighthouse::intensity(0, col, p) >= 120);  // half a column off for 4 beams
    }
  }
}

static void test_beam_profile() {
  for (uint8_t w = 2; w <= 9; w++)
    for (uint16_t d = 0; d <= COLS * 128; d += 16) TEST_ASSERT_INT_WITHIN(2, toByte(refBeam(d / 256.0, w)), lighthouse::beam(d, w));
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
  const uint8_t fronts[] = {0, 5, COLS - 1};
  for (uint8_t front : fronts)
    for (uint8_t flash = 25; flash <= 100; flash += 75) {
      lighthouse::Params p{60, flash, 5, front, 1};
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
  lighthouse::Params p{0, 0, 3, 4, 1};
  TEST_ASSERT_EQUAL_UINT8(255, lighthouse::intensity(0, 4, p));
  TEST_ASSERT_EQUAL_UINT8(0, lighthouse::intensity(0, 6, p));
  uint32_t later = phaseOf(1.0 / COLS);  // one column on
  TEST_ASSERT_EQUAL_UINT8(255, lighthouse::intensity(later, 5, p));
  // Wraps: front on the last column, a quarter-column on, column 0 is nearer than the one before the front.
  lighthouse::Params q{0, 0, 3, COLS - 1, 1};
  uint32_t q4 = phaseOf(0.25 / COLS);
  TEST_ASSERT_TRUE(lighthouse::intensity(q4, 0, q) > lighthouse::intensity(q4, COLS - 2, q));
}

static void test_every_beam_flashes_at_the_front() {
  // Three beams with a full flash: the front column reaches 255 three times a turn, once per beam.
  lighthouse::Params p{60, 100, 5, 7, 3};
  int peaks = 0;
  bool high = lighthouse::intensity(65532UL << 16, 7, p) >= 250;  // carry the peak across the wrap
  for (uint32_t i = 0; i < 65536; i += 4) {
    bool now = lighthouse::intensity(i << 16, 7, p) >= 250;
    peaks += now && !high;
    high = now;
  }
  TEST_ASSERT_EQUAL_INT(3, peaks);
}

static void test_render_rows_identical() {
  TestFrame t;
  lighthouse::Params p{60, 50, 5, 0, 4};
  uint32_t phase = phaseOf(0.1);
  lighthouse::render(t.f, phase, rgbFrom(0xFFFFFF), p);
  for (uint8_t c = 0; c < COLS; c++)
    for (uint8_t r = 0; r < ROWS; r++) TEST_ASSERT_EQUAL_UINT8(lighthouse::intensity(phase, c, p), t.f.get(r, c).r);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_theta_matches_reference);
  RUN_TEST(test_theta_monotonic_and_exact_period);
  RUN_TEST(test_whip_fastest_at_every_beam_pass);
  RUN_TEST(test_constant_speed_without_whip);
  RUN_TEST(test_beams_evenly_spaced);
  RUN_TEST(test_every_beam_flashes_at_the_front);
  RUN_TEST(test_beam_profile);
  RUN_TEST(test_flash_gain);
  RUN_TEST(test_peak_brightness_at_front_column);
  RUN_TEST(test_beam_centre_and_direction);
  RUN_TEST(test_render_rows_identical);
  return UNITY_END();
}
