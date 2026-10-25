#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

static const pulse::Params DEF{87, 0, pulse::ACCELERATE};  // the styles.json defaults: wave.ino

// arduino/wave/wave.ino at its own constants (womp 900 ms, gap 500 ms, stagger 160 ms), without its
// brightness floor (PLAN.md §0: black background). t in µs.
static int waveIno(uint32_t t, uint8_t row) {
  const uint32_t womp = 900000, gap = 500000, stagger = 160000;
  uint32_t cycle = t % (womp + gap);
  if (cycle >= womp || cycle < row * stagger) return 0;
  uint32_t local = cycle - row * stagger, waveLen = womp - stagger * 2;
  if (local >= waveLen) return 0;
  return dim8Video(sin8((uint8_t)((uint64_t)local * 128 / waveLen)));
}

static void test_matches_wave_ino_at_1400ms() {
  // The climb spans wave.ino's, over ROWS rows: the bottom, middle and top rows are wave.ino's rows 0, 1, 2.
  // Phase vs microsecond rounding can move an angle step by a few µs; accept a neighbour's value there.
  static_assert((ROWS - 1) % 2 == 0, "a middle row lines up with wave.ino's row 1");
  for (uint32_t t = 0; t < 1400000; t += 97)
    for (uint8_t w = 0; w < 3; w++) {
      int got = pulse::intensity(phaseOf(t / 1400000.0), (uint8_t)(w * (ROWS - 1) / 2), DEF);
      bool ok = got == waveIno(t, w) || got == waveIno(t + 20, w) || (t >= 20 && got == waveIno(t - 20, w));
      if (!ok) TEST_FAIL_MESSAGE("differs from wave.ino");
    }
}

static void test_rows_start_evenly_staggered() {
  // Each row lights up (sin8(0) → 65 after dim8_video) the same time after the one below.
  uint32_t on[ROWS] = {};
  for (uint32_t i = 0; i < 65536; i++)
    for (uint8_t r = 0; r < ROWS; r++)
      if (!on[r] && pulse::intensity(i << 16, r, DEF) > 0) on[r] = i + 1;
  for (uint8_t r = 1; r < ROWS; r++)
    TEST_ASSERT_UINT32_WITHIN(2, (uint32_t)(65536 * 3.2 / 14 / (ROWS - 1)), on[r] - on[r - 1]);
}

static void test_rate_midpoint_is_1400ms() {
  Engine e;
  e.loadStyle(STYLE_PULSE);
  e.setRate(500);
  for (int ms = 0; ms < 1400; ms++) e.tick(1000);
  double phi = phiOf(e.phase());
  TEST_ASSERT_TRUE((phi > 0.5 ? 1 - phi : phi) < 0.001);
}

static void test_rows_peak_bottom_to_top() {
  uint32_t peakAt[ROWS] = {};
  int peak[ROWS] = {};
  for (uint32_t i = 0; i < 65536; i++)
    for (uint8_t r = 0; r < ROWS; r++) {
      int v = pulse::intensity(i << 16, r, DEF);
      if (v > peak[r]) peak[r] = v, peakAt[r] = i;
    }
  for (uint8_t r = 0; r < ROWS; r++) TEST_ASSERT_EQUAL_INT(255, peak[r]);
  for (uint8_t r = 1; r < ROWS; r++) TEST_ASSERT_TRUE(peakAt[r - 1] < peakAt[r]);
}

static void test_dark_during_gap() {
  // The swell ends at 9/14 of the cycle (wave.ino's womp); the rest is dark.
  for (double phi = 9.0 / 14 + 1e-6; phi < 1; phi += 0.0005)
    for (uint8_t r = 0; r < ROWS; r++) TEST_ASSERT_EQUAL_UINT8(0, pulse::intensity(phaseOf(phi), r, DEF));
  TEST_ASSERT_TRUE(pulse::intensity(phaseOf(9.0 / 14 - 0.001), ROWS - 1, DEF) > 0);
}

// Phase (uint16 turns) at which each row first lights.
static void onsets(const pulse::Params& p, uint32_t* on) {
  for (uint8_t r = 0; r < ROWS; r++) on[r] = 0;
  for (uint32_t i = 0; i < 65536; i++)
    for (uint8_t r = 0; r < ROWS; r++)
      if (!on[r] && pulse::intensity(i << 16, r, p) > 0) on[r] = i + 1;
}

static void test_climb_endpoints_and_monotonic() {
  for (uint8_t shape = 0; shape <= 2; shape++)
    for (uint8_t whip = 0; whip <= 90; whip += 15) {
      TEST_ASSERT_EQUAL_UINT32(0, pulse::climb(0, whip, shape));
      TEST_ASSERT_UINT32_WITHIN(1, 65536, pulse::climb(ROWS - 1, whip, shape));
      for (uint8_t r = 1; r < ROWS; r++) TEST_ASSERT_TRUE(pulse::climb(r, whip, shape) > pulse::climb(r - 1, whip, shape));
    }
}

static void test_no_whip_is_even_for_every_shape() {
  for (uint8_t shape = 0; shape <= 2; shape++)
    for (uint8_t r = 0; r < ROWS; r++) TEST_ASSERT_EQUAL_UINT32(pulse::climb(r, 0, 0), pulse::climb(r, 0, shape));
}

static void test_climb_matches_reference() {
  for (uint8_t whip = 0; whip <= 90; whip += 30)
    for (uint8_t r = 0; r < ROWS; r++) {
      double u = (double)r / (ROWS - 1), k = whip / 100.0;
      double want[3] = {u + k * u * (1 - u), u + k / (2 * PI_D) * sin(2 * PI_D * u), u - k * u * (1 - u)};
      for (uint8_t shape = 0; shape <= 2; shape++)
        TEST_ASSERT_INT_WITHIN(40, (int)lround(want[shape] * 65536), (int)pulse::climb(r, whip, shape));
    }
}

static void test_whip_shapes_change_the_stagger() {
  uint32_t on[ROWS];
  // Accelerate: each row starts sooner after the one below than the last did.
  onsets(pulse::Params{87, 80, pulse::ACCELERATE}, on);
  for (uint8_t r = 2; r < ROWS; r++) TEST_ASSERT_TRUE(on[r] - on[r - 1] < on[r - 1] - on[r - 2]);
  // Decelerate: the reverse.
  onsets(pulse::Params{87, 80, pulse::DECELERATE}, on);
  for (uint8_t r = 2; r < ROWS; r++) TEST_ASSERT_TRUE(on[r] - on[r - 1] > on[r - 1] - on[r - 2]);
  // Fast middle: the middle gaps are shorter than the end ones.
  onsets(pulse::Params{87, 80, pulse::FAST_MIDDLE}, on);
  TEST_ASSERT_TRUE(on[ROWS / 2] - on[ROWS / 2 - 1] < on[1] - on[0]);
  TEST_ASSERT_TRUE(on[ROWS / 2] - on[ROWS / 2 - 1] < on[ROWS - 1] - on[ROWS - 2]);
  // The whole climb still takes 3.2/14 of the cycle.
  TEST_ASSERT_UINT32_WITHIN(2, (uint32_t)(65536 * 3.2 / 14), on[ROWS - 1] - on[0]);
}

static void test_thickness_sets_rows_lit_at_once() {
  // Each row glows for thickness/8 mean staggers, so at the busiest moment about that many rows are lit.
  const uint8_t thick[] = {8, 24, 40};
  for (uint8_t t : thick) {
    pulse::Params p{t, 0, pulse::ACCELERATE};
    int most = 0;
    for (uint32_t i = 0; i < 65536; i += 8) {
      int lit = 0;
      for (uint8_t r = 0; r < ROWS; r++) lit += pulse::intensity(i << 16, r, p) > 0;
      most = lit > most ? lit : most;
    }
    TEST_ASSERT_INT_WITHIN(1, t / 8, most);
  }
}

static void test_thickest_band_ends_inside_the_cycle() {
  pulse::Params p{160, 90, pulse::FAST_MIDDLE};
  TEST_ASSERT_TRUE(pulse::intensity(phaseOf(0.97), ROWS - 1, p) > 0);
  for (uint8_t r = 0; r < ROWS; r++) TEST_ASSERT_EQUAL_UINT8(0, pulse::intensity(phaseOf(0.9999), r, p));
}

static void test_render_columns_identical() {
  TestFrame t;
  uint32_t phase = phaseOf(0.3);
  pulse::Params p{40, 60, pulse::FAST_MIDDLE};
  pulse::render(t.f, phase, rgbFrom(0xFFFFFF), p);
  for (uint8_t r = 0; r < ROWS; r++)
    for (uint8_t c = 0; c < COLS; c++) TEST_ASSERT_EQUAL_UINT8(pulse::intensity(phase, r, p), t.f.get(r, c).g);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_matches_wave_ino_at_1400ms);
  RUN_TEST(test_rate_midpoint_is_1400ms);
  RUN_TEST(test_rows_start_evenly_staggered);
  RUN_TEST(test_rows_peak_bottom_to_top);
  RUN_TEST(test_dark_during_gap);
  RUN_TEST(test_climb_endpoints_and_monotonic);
  RUN_TEST(test_no_whip_is_even_for_every_shape);
  RUN_TEST(test_climb_matches_reference);
  RUN_TEST(test_whip_shapes_change_the_stagger);
  RUN_TEST(test_thickness_sets_rows_lit_at_once);
  RUN_TEST(test_thickest_band_ends_inside_the_cycle);
  RUN_TEST(test_render_columns_identical);
  return UNITY_END();
}
