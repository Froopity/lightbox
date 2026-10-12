#include <unity.h>

#include "../support.h"

using namespace core;

void setUp() {}
void tearDown() {}

static void test_scale8_full_and_zero() {
  for (int i = 0; i < 256; i++) {
    TEST_ASSERT_EQUAL_UINT8(i, scale8((uint8_t)i, 255));
    TEST_ASSERT_EQUAL_UINT8(0, scale8((uint8_t)i, 0));
  }
}

static void test_scale8_matches_fastled() {
  for (int i = 0; i < 256; i += 7)
    for (int s = 0; s < 256; s += 5) TEST_ASSERT_EQUAL_UINT8((i * (1 + s)) >> 8, scale8((uint8_t)i, (uint8_t)s));
}

static void test_blend_endpoints_and_midpoint() {
  Rgb a{200, 10, 0}, b{0, 110, 255};
  Rgb at0 = blend(a, b, 0);
  TEST_ASSERT_EQUAL_UINT8(200, at0.r);
  TEST_ASSERT_EQUAL_UINT8(10, at0.g);
  TEST_ASSERT_EQUAL_UINT8(0, at0.b);
  Rgb at255 = blend(a, b, 255);
  TEST_ASSERT_UINT8_WITHIN(1, 0, at255.r);
  TEST_ASSERT_UINT8_WITHIN(1, 110, at255.g);
  TEST_ASSERT_UINT8_WITHIN(1, 255, at255.b);
  Rgb mid = blend(a, b, 128);
  TEST_ASSERT_UINT8_WITHIN(1, 100, mid.r);
  TEST_ASSERT_UINT8_WITHIN(1, 60, mid.g);
  TEST_ASSERT_UINT8_WITHIN(1, 128, mid.b);
}

static void test_rgb_from_hex() {
  Rgb c = rgbFrom(0x9966CC);
  TEST_ASSERT_EQUAL_UINT8(0x99, c.r);
  TEST_ASSERT_EQUAL_UINT8(0x66, c.g);
  TEST_ASSERT_EQUAL_UINT8(0xCC, c.b);
}

static void test_sin16_accuracy() {
  int worst = 0;
  for (uint32_t t = 0; t < 65536; t++) {
    int ref = (int)lround(sin(2 * PI_D * t / 65536.0) * 32767);
    int err = abs(sin16((uint16_t)t) - ref);
    if (err > worst) worst = err;
  }
  TEST_ASSERT_LESS_OR_EQUAL_INT(230, worst);  // FastLED's sin16 is good to ~0.7% (< 2/255)
  TEST_ASSERT_UINT16_WITHIN(130, 0, raisedCos16(0));  // sin16 peaks at 32645, not 32767
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_scale8_full_and_zero);
  RUN_TEST(test_scale8_matches_fastled);
  RUN_TEST(test_blend_endpoints_and_midpoint);
  RUN_TEST(test_rgb_from_hex);
  RUN_TEST(test_sin16_accuracy);
  return UNITY_END();
}
