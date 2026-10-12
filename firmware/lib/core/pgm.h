// Flash-resident constant data. On AVR, CORE_PROGMEM puts data in flash and pgmCopy reads it back;
// on the host both are plain memory. avr-libc only, no Arduino includes.
#pragma once
#include <stddef.h>
#include <string.h>

#ifdef __AVR__
#include <avr/pgmspace.h>
#define CORE_PROGMEM PROGMEM
#else
#define CORE_PROGMEM
#endif

namespace core {

inline void pgmCopy(void* dst, const void* src, size_t n) {
#ifdef __AVR__
  memcpy_P(dst, src, n);
#else
  memcpy(dst, src, n);
#endif
}

}  // namespace core
