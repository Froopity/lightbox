#include <unity.h>

#include "core.h"

void setUp() {}
void tearDown() {}

static void test_geometry() {
  TEST_ASSERT_EQUAL_UINT8(3, core::ROWS);
  TEST_ASSERT_EQUAL_UINT8(17, core::COLS);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_geometry);
  return UNITY_END();
}
