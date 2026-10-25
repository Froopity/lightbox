#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

// §3.2 reference profile, d in whole columns behind the head, L in columns.
static double refProfile(int d, double L) {
  if (d == 0) return 1;
  if (d < 0 || d >= L + 1) return 0;
  return pow(1 - d / (L + 1), 2);
}

static int refHead(double phi, int line) { return (int)floor(COLS * phi + COLS / 2.0 * line) % COLS; }

static void test_profile_matches_reference() {
  for (uint8_t tail = 0; tail <= 16; tail++)
    for (int8_t d = -3; d <= 12; d++) TEST_ASSERT_INT_WITHIN(2, toByte(refProfile(d, tail * 0.5)), alarm::profile(d, tail));
}

static void test_heads_follow_cols_phi_and_sit_half_a_turn_apart() {
  for (int i = 0; i < 10000; i++) {
    double phi = (i + 0.5) / 10000.0;
    TEST_ASSERT_EQUAL_UINT8(refHead(phi, 0), alarm::headColumn(phaseOf(phi), 0));
    TEST_ASSERT_EQUAL_UINT8(refHead(phi, 1), alarm::headColumn(phaseOf(phi), 1));
  }
}

static void test_zero_tail_is_two_full_columns() {
  for (int i = 0; i < 2000; i++) {
    uint32_t phase = phaseOf((i + 0.5) / 2000.0);
    int lit = 0;
    for (uint8_t c = 0; c < COLS; c++) {
      uint8_t v = alarm::intensity(phase, c, 0);
      TEST_ASSERT_TRUE(v == 0 || v == 255);
      lit += v == 255;
    }
    TEST_ASSERT_EQUAL_INT(2, lit);
    TEST_ASSERT_EQUAL_UINT8(255, alarm::intensity(phase, alarm::headColumn(phase, 0), 0));
    TEST_ASSERT_EQUAL_UINT8(255, alarm::intensity(phase, alarm::headColumn(phase, 1), 0));
  }
}

static void test_tail_trails_behind_only() {
  uint32_t phase = phaseOf(5.2 / COLS);  // line 0 on column 5, line 1 on column 14
  uint8_t tail = 6;                      // 3 columns
  TEST_ASSERT_EQUAL_UINT8(255, alarm::intensity(phase, 5, tail));
  TEST_ASSERT_INT_WITHIN(2, toByte(pow(1 - 1 / 4.0, 2)), alarm::intensity(phase, 4, tail));
  TEST_ASSERT_INT_WITHIN(2, toByte(pow(1 - 3 / 4.0, 2)), alarm::intensity(phase, 2, tail));
  TEST_ASSERT_EQUAL_UINT8(0, alarm::intensity(phase, 1, tail));
  TEST_ASSERT_EQUAL_UINT8(0, alarm::intensity(phase, 6, tail));  // ahead of line 0
}

static void test_steps_through_every_column_in_order() {
  // Fastest rate, 1 ms frames: each line moves one column forward at a time, never skipping.
  Engine e;
  e.loadStyle(STYLE_ALARM);
  e.setRate(1000);
  uint8_t prev = alarm::headColumn(e.phase(), 0), steps = 0;
  for (int ms = 0; ms < 300; ms++) {
    e.tick(1000);
    uint8_t cur = alarm::headColumn(e.phase(), 0);
    if (cur != prev) {
      TEST_ASSERT_EQUAL_UINT8((prev + 1) % COLS, cur);
      steps++;
    }
    prev = cur;
  }
  TEST_ASSERT_EQUAL_UINT8(COLS, steps);  // one revolution in 300 ms
}

static void test_render_rows_identical() {
  TestFrame t;
  uint32_t phase = phaseOf(0.37);
  alarm::render(t.f, phase, rgbFrom(0xFF0000), 4);
  for (uint8_t c = 0; c < COLS; c++) {
    uint8_t i = alarm::intensity(phase, c, 4);
    for (uint8_t r = 0; r < ROWS; r++) {
      TEST_ASSERT_EQUAL_UINT8(i, t.f.get(r, c).r);
      TEST_ASSERT_EQUAL_UINT8(0, t.f.get(r, c).g);
    }
  }
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_profile_matches_reference);
  RUN_TEST(test_heads_follow_cols_phi_and_sit_half_a_turn_apart);
  RUN_TEST(test_zero_tail_is_two_full_columns);
  RUN_TEST(test_tail_trails_behind_only);
  RUN_TEST(test_steps_through_every_column_in_order);
  RUN_TEST(test_render_rows_identical);
  return UNITY_END();
}
