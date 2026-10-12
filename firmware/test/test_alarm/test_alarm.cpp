#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

// §3.2 reference profile, d in columns, L in columns.
static double refProfile(double d, double L) {
  if (d < -1) return 0;
  if (d < 0) return 1 + d;
  if (d <= L + 1) return pow(1 - d / (L + 1), 2);
  return 0;
}

static double wrapCols(double d) {
  d = fmod(d, 17.0);
  if (d <= -8.5) d += 17;
  if (d > 8.5) d -= 17;
  return d;
}

static double refIntensity(double phi, int col, double L) {
  double x0 = 17 * phi, x1 = x0 + 8.5;
  double a = refProfile(wrapCols(x0 - col), L), b = refProfile(wrapCols(x1 - col), L);
  return a > b ? a : b;
}

static void test_profile_matches_reference() {
  for (uint8_t tail = 0; tail <= 16; tail++)
    for (int32_t d = -3 * alarm::COL_Q; d <= 12 * alarm::COL_Q; d += 97)
      TEST_ASSERT_INT_WITHIN(2, toByte(refProfile((double)d / alarm::COL_Q, tail * 0.5)), alarm::profile(d, tail));
}

static void test_intensity_matches_reference() {
  for (uint8_t tail = 0; tail <= 16; tail += 4)
    for (int i = 0; i < 1000; i++) {
      double phi = i / 1000.0;
      for (uint8_t c = 0; c < COLS; c++)
        TEST_ASSERT_INT_WITHIN(2, toByte(refIntensity(phi, c, tail * 0.5)), alarm::intensity(phaseOf(phi), c, tail));
    }
}

static void test_peak_column_tracks_head() {
  for (int k = 0; k < 17; k++) {
    uint32_t phase = phaseOf((k + 0.001) / 17.0);  // head just past column k
    TEST_ASSERT_UINT8_WITHIN(1, 255, alarm::intensity(phase, (uint8_t)k, 8));
    for (uint8_t c = 0; c < COLS; c++) TEST_ASSERT_TRUE(alarm::intensity(phase, c, 8) <= alarm::intensity(phase, (uint8_t)k, 8));
  }
}

static void test_lines_are_8_5_columns_apart() {
  // Head 0 at column 3.5: head 1 sits at column 12, so column 12 is fully lit and 3/4 share the first head.
  uint32_t phase = phaseOf(3.5 / 17.0);
  TEST_ASSERT_UINT8_WITHIN(1, 255, alarm::intensity(phase, 12, 8));
  TEST_ASSERT_INT_WITHIN(2, toByte(0.5), alarm::intensity(phase, 4, 8));  // leading edge, half a column ahead
  TEST_ASSERT_INT_WITHIN(2, toByte(pow(1 - 0.5 / 5, 2)), alarm::intensity(phase, 3, 8));
}

static void test_zero_tail_lights_only_antialiased_columns() {
  for (int i = 0; i < 2000; i++) {
    uint32_t phase = phaseOf(i / 2000.0);
    int lit = 0;
    for (uint8_t c = 0; c < COLS; c++) lit += alarm::intensity(phase, c, 0) > 0;
    TEST_ASSERT_TRUE(lit >= 2 && lit <= 4);  // 1–2 per line
  }
}

static void test_no_column_steps_more_than_tail_slope() {
  // Fastest rate, 1 ms frames, a full revolution, every tail length.
  for (uint8_t tail = 0; tail <= 16; tail++) {
    Engine e;
    e.loadStyle(STYLE_ALARM);
    e.setRate(1000);
    e.setParam(0, tail);
    uint8_t prev[COLS];
    for (uint8_t c = 0; c < COLS; c++) prev[c] = alarm::intensity(e.phase(), c, tail);
    int limit = (int)ceil(255.0 / (tail * 0.5 + 1));
    for (int ms = 0; ms < 300; ms++) {
      e.tick(1000);
      for (uint8_t c = 0; c < COLS; c++) {
        uint8_t cur = alarm::intensity(e.phase(), c, tail);
        TEST_ASSERT_INT_WITHIN(limit, prev[c], cur);
        prev[c] = cur;
      }
    }
  }
}

static void test_render_rows_identical() {
  TestFrame t;
  uint32_t phase = phaseOf(0.37);
  alarm::render(t.f, phase, rgbFrom(0xFF0000), 8);
  for (uint8_t c = 0; c < COLS; c++) {
    uint8_t i = alarm::intensity(phase, c, 8);
    for (uint8_t r = 0; r < ROWS; r++) {
      TEST_ASSERT_EQUAL_UINT8(i, t.f.get(r, c).r);
      TEST_ASSERT_EQUAL_UINT8(0, t.f.get(r, c).g);
    }
  }
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_profile_matches_reference);
  RUN_TEST(test_intensity_matches_reference);
  RUN_TEST(test_peak_column_tracks_head);
  RUN_TEST(test_lines_are_8_5_columns_apart);
  RUN_TEST(test_zero_tail_lights_only_antialiased_columns);
  RUN_TEST(test_no_column_steps_more_than_tail_slope);
  RUN_TEST(test_render_rows_identical);
  return UNITY_END();
}
