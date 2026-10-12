#include "protocol.h"

#include "pgm.h"

namespace core {
namespace protocol {

namespace {

int8_t hexDigit(char c) {
  if (c >= '0' && c <= '9') return (int8_t)(c - '0');
  if (c >= 'A' && c <= 'F') return (int8_t)(c - 'A' + 10);
  if (c >= 'a' && c <= 'f') return (int8_t)(c - 'a' + 10);
  return -1;
}

// Arguments: each is one space then a token; tokens end at a space or the end of the payload.
struct Args {
  const char* p;
  const char* end;

  bool space() {
    if (p == end || *p != ' ') return false;
    p++;
    return true;
  }
  bool atTokenEnd() const { return p == end || *p == ' '; }
  // Decimal, one or more digits (leading zeros allowed), at most 65535.
  bool num(uint16_t& out) {
    if (!space() || p == end || *p < '0' || *p > '9') return false;
    uint32_t v = 0;
    while (p != end && *p >= '0' && *p <= '9') {
      v = v * 10 + (uint32_t)(*p++ - '0');
      if (v > 0xFFFF) return false;
    }
    out = (uint16_t)v;
    return atTokenEnd();
  }
  bool num(uint16_t& out, uint16_t max) { return num(out) && out <= max; }
  // Exactly six hex digits, either case.
  bool hex6(uint32_t& out) {
    if (!space()) return false;
    out = 0;
    for (uint8_t i = 0; i < 6; i++) {
      int8_t d = p == end ? -1 : hexDigit(*p);
      if (d < 0) return false;
      out = out << 4 | (uint32_t)d;
      p++;
    }
    return atTokenEnd();
  }
  bool done() const { return p == end; }
};

struct Writer {
  PutFn put;

  void str(const char* flashStr) {
    for (char c; (c = (char)pgmByte(flashStr)) != 0; flashStr++) put(c);
  }
  void num(uint16_t v) {
    char buf[5];
    uint8_t n = 0;
    do {
      buf[n++] = (char)('0' + v % 10);
      v /= 10;
    } while (v);
    while (n) put(buf[--n]);
  }
  void hex6(uint32_t v) {
    static const char HEX_DIGITS[] CORE_PROGMEM = "0123456789ABCDEF";
    for (int8_t shift = 20; shift >= 0; shift -= 4) put((char)pgmByte(&HEX_DIGITS[(v >> shift) & 0xF]));
  }
  void sp() { put(' '); }
  void end() { put('\n'); }
};

const char S_OK[] CORE_PROGMEM = "OK";
const char S_HELLO[] CORE_PROGMEM = "OK lightbox ";
const char S_ERR[] CORE_PROGMEM = "ERR ";
const char S_DUMP[] CORE_PROGMEM = "S ";

void dump(Writer& w, const Engine& e, uint16_t fps) {
  w.str(S_DUMP);
  w.num(e.style());
  w.sp();
  w.num(e.rate());
  w.sp();
  w.num(e.brightness());
  w.sp();
  w.num(e.global());
  for (uint8_t i = 0; i < MAX_COLORS; i++) w.sp(), w.hex6(e.color(i));
  for (uint8_t i = 0; i < MAX_PARAMS; i++) w.sp(), w.num(e.param(i));
  // LFO on, target, mHz, depth: placeholders until Phase 6.
  for (uint8_t i = 0; i < 4; i++) w.sp(), w.num(0);
  w.sp();
  w.num(fps);
}

// Parses and applies one checksum-verified payload. Writes the success reply; the caller writes errors.
Result apply(Args a, Engine& e, uint16_t fps, Writer& w) {
  if (a.done()) return ERR_UNKNOWN;
  char cmd = *a.p++;
  if (!a.atTokenEnd()) return ERR_UNKNOWN;
  uint16_t v, idx;
  uint32_t rgb;
  switch (cmd) {
    case 'H':
      if (!a.done()) return ERR_ARGS;
      w.str(S_HELLO);
      w.num(VERSION);
      return OK;
    case '?':
      if (!a.done()) return ERR_ARGS;
      dump(w, e, fps);
      return OK;
    case 'P': {
      uint16_t style, r, b, params[MAX_PARAMS];
      uint32_t colors[MAX_COLORS];
      if (!a.num(style, STYLE_COUNT - 1) || !a.num(r, WIRE_MAX) || !a.num(b, WIRE_MAX)) return ERR_ARGS;
      for (uint8_t i = 0; i < MAX_COLORS; i++)
        if (!a.hex6(colors[i])) return ERR_ARGS;
      for (uint8_t i = 0; i < MAX_PARAMS; i++)
        if (!a.num(params[i])) return ERR_ARGS;
      if (!a.done()) return ERR_ARGS;
      e.loadStyle((uint8_t)style);
      e.setRate(r);
      e.setBrightness(b);
      for (uint8_t i = 0; i < MAX_COLORS; i++) e.setColor(i, colors[i]);
      for (uint8_t i = 0; i < MAX_PARAMS; i++) e.setParam(i, params[i]);  // ignores params the style lacks
      break;
    }
    case 'R':
      if (!a.num(v, WIRE_MAX) || !a.done()) return ERR_ARGS;
      e.setRate(v);
      break;
    case 'B':
      if (!a.num(v, WIRE_MAX) || !a.done()) return ERR_ARGS;
      e.setBrightness(v);
      break;
    case 'G':
      if (!a.num(v, WIRE_MAX) || !a.done()) return ERR_ARGS;
      e.setGlobal(v);
      break;
    case 'C':
      if (!a.num(idx, MAX_COLORS - 1) || !a.hex6(rgb) || !a.done()) return ERR_ARGS;
      e.setColor((uint8_t)idx, rgb);
      break;
    case 'A':
      if (!a.num(idx) || !a.num(v) || !a.done() || idx >= e.paramCount()) return ERR_ARGS;
      e.setParam((uint8_t)idx, v);
      break;
    default:
      return ERR_UNKNOWN;
  }
  w.str(S_OK);
  return OK;
}

}  // namespace

Result handle(const char* line, uint16_t len, Engine& e, uint16_t fps, PutFn put) {
  Writer w{put};
  Result r;
  if (len > MAX_LINE) {
    r = ERR_TOO_LONG;
  } else {
    // The line ends in "*HH": the XOR of every byte before '*'.
    int8_t hi = len >= 3 ? hexDigit(line[len - 2]) : -1, lo = len >= 3 ? hexDigit(line[len - 1]) : -1;
    uint8_t payload = (uint8_t)(len >= 3 ? len - 3 : 0), x = 0;
    for (uint8_t i = 0; i < payload; i++) x ^= (uint8_t)line[i];
    if (len < 3 || line[payload] != '*' || hi < 0 || lo < 0 || (uint8_t)(hi << 4 | lo) != x)
      r = ERR_CHECKSUM;
    else
      r = apply(Args{line, line + payload}, e, fps, w);
  }
  if (r != OK) {
    w.str(S_ERR);
    w.num(r);
  }
  w.end();
  return r;
}

}  // namespace protocol
}  // namespace core
