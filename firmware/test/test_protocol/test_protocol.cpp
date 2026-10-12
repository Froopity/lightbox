// Runs every case in shared/protocol-fixtures.json (via the generated fixtures_gen.h) through the
// firmware parser, plus firmware-only checks. The web suite runs the same fixtures.
#include <stdio.h>
#include <string.h>
#include <unity.h>

#include "../support.h"
#include "fixtures_gen.h"

using namespace core;

static char reply[160];
static uint8_t replyLen;

static void put(char c) {
  if (replyLen < sizeof reply - 1) reply[replyLen++] = c;
  reply[replyLen] = 0;
}

// Sends a line and returns the reply without its '\n' (the parser must always end with exactly one).
static const char* send(Engine& e, const char* line, uint16_t fps = 0) {
  replyLen = 0;
  reply[0] = 0;
  protocol::handle(line, (uint16_t)strlen(line), e, fps, put);
  TEST_ASSERT_TRUE_MESSAGE(replyLen > 0 && reply[replyLen - 1] == '\n', "reply must end with one newline");
  reply[--replyLen] = 0;
  TEST_ASSERT_NULL_MESSAGE(strchr(reply, '\n'), "reply must be a single line");
  return reply;
}

static void stateOf(const Engine& e, int32_t out[STATE_SLOTS]) {
  int32_t s[STATE_SLOTS] = {e.style(), e.rate(), e.brightness(), e.global(), (int32_t)e.color(0), (int32_t)e.color(1),
                            e.param(0), e.param(1), e.param(2), e.param(3)};
  memcpy(out, s, sizeof s);
}

void setUp() {}
void tearDown() {}

static void test_boot_state_matches_fixtures() {
  Engine e;
  int32_t s[STATE_SLOTS];
  stateOf(e, s);
  TEST_ASSERT_EQUAL_INT32_ARRAY(BOOT_STATE, s, STATE_SLOTS);
}

static void test_fixtures() {
  char msg[200];
  for (const Fixture& f : FIXTURES) {
    Engine e;
    for (uint8_t i = 0; i < MAX_BEFORE && f.before[i]; i++) {
      snprintf(msg, sizeof msg, "%s: before[%u]", f.name, i);
      TEST_ASSERT_EQUAL_STRING_MESSAGE("OK", send(e, f.before[i]), msg);
    }
    int32_t before[STATE_SLOTS], after[STATE_SLOTS];
    stateOf(e, before);
    const char* r = send(e, f.line);
    stateOf(e, after);
    snprintf(msg, sizeof msg, "%s: reply", f.name);
    if (f.error) {
      char want[8];
      snprintf(want, sizeof want, "ERR %u", f.error);
      TEST_ASSERT_EQUAL_STRING_MESSAGE(want, r, msg);
      snprintf(msg, sizeof msg, "%s: state must not change on error", f.name);
      TEST_ASSERT_EQUAL_INT32_ARRAY_MESSAGE(before, after, STATE_SLOTS, msg);
    } else {
      TEST_ASSERT_EQUAL_STRING_MESSAGE(f.reply, r, msg);
    }
    for (uint8_t i = 0; i < STATE_SLOTS; i++) {
      if (f.state[i] < 0) continue;
      snprintf(msg, sizeof msg, "%s: state slot %u", f.name, i);
      TEST_ASSERT_EQUAL_INT32_MESSAGE(f.state[i], after[i], msg);
    }
  }
}

static void test_dump_reports_fps() {
  Engine e;
  const char* r = send(e, "?*3F", 412);
  TEST_ASSERT_EQUAL_STRING("412", strrchr(r, ' ') + 1);
}

static void test_preset_restarts_phase() {
  Engine e;
  e.tick(250000);
  TEST_ASSERT_NOT_EQUAL(0, e.phase());
  TEST_ASSERT_EQUAL_STRING("OK", send(e, "P 1 250 900 00FF00 000000 6 0 0 0*49"));
  TEST_ASSERT_EQUAL_UINT32(0, e.phase());
}

static void test_rate_command_keeps_phase() {
  Engine e;
  e.tick(250000);
  uint32_t before = e.phase();
  TEST_ASSERT_EQUAL_STRING("OK", send(e, "R 1000*73"));
  TEST_ASSERT_EQUAL_UINT32(before, e.phase());
}

static void test_too_long_length_beyond_buffer() {
  // main.cpp stops storing at MAX_LINE but passes the real length.
  Engine e;
  char line[protocol::MAX_LINE] = {};
  memset(line, 'R', sizeof line);
  replyLen = 0;
  TEST_ASSERT_EQUAL(protocol::ERR_TOO_LONG, protocol::handle(line, 500, e, 0, put));
  TEST_ASSERT_EQUAL_STRING("ERR 4\n", reply);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_boot_state_matches_fixtures);
  RUN_TEST(test_fixtures);
  RUN_TEST(test_dump_reports_fps);
  RUN_TEST(test_preset_restarts_phase);
  RUN_TEST(test_rate_command_keeps_phase);
  RUN_TEST(test_too_long_length_beyond_buffer);
  return UNITY_END();
}
