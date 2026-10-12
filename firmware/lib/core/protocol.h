// Serial command parser and replies (PLAN.md §4). Takes one complete line (without '\n'), applies it to
// the Engine, and writes the reply line, '\n' included, through a caller-supplied put function.
// The wake/CTS handshake and line assembly live in main.cpp.
#pragma once
#include <stdint.h>

#include "engine.h"

namespace core {
namespace protocol {

constexpr uint8_t VERSION = 1;
constexpr uint8_t MAX_LINE = 72;  // bytes, checksum included, '\n' excluded

enum Result : uint8_t { OK = 0, ERR_CHECKSUM = 1, ERR_UNKNOWN = 2, ERR_ARGS = 3, ERR_TOO_LONG = 4 };

using PutFn = void (*)(char c);

// len may exceed MAX_LINE (the caller stops storing but keeps counting), which replies ERR 4.
// fps is reported in the `?` dump.
Result handle(const char* line, uint16_t len, Engine& e, uint16_t fps, PutFn put);

}  // namespace protocol
}  // namespace core
