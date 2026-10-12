// Serial spike (PLAN.md §4, env:spike). Renders Alarm flat-out and accepts checksummed lines either
// naively (bytes read between shows) or with the wake/CTS handshake. Results: firmware/NOTES.md.
// At boot it waits for a mode byte: 'n' = naive, 'w' = wake/CTS. Replies "OK <payload length>"
// (or "FPS <n>" for the line "F"), "ERR 1" on a bad checksum, "ERR 4" if the line overflows.
#include <Arduino.h>
#include <FastLED.h>

#include "core.h"
#include "layout.h"

CRGB leds[NUM_LEDS];
core::Engine engine;
core::Frame frame{reinterpret_cast<core::Rgb*>(leds), ledIndex};

static const uint8_t MAX_LINE = 72;
static char line[MAX_LINE + 1];
static uint8_t len;
static bool overflow;
static bool wakeMode;
static uint32_t lastUs, fpsStartUs;
static uint16_t frames, fps;

static uint8_t hexVal(char c) {
  if (c >= '0' && c <= '9') return (uint8_t)(c - '0');
  if (c >= 'A' && c <= 'F') return (uint8_t)(c - 'A' + 10);
  if (c >= 'a' && c <= 'f') return (uint8_t)(c - 'a' + 10);
  return 0xFF;
}

static void handleLine() {
  if (overflow) {
    Serial.println(F("ERR 4"));
  } else {
    // Payload is everything before the trailing "*HH".
    bool ok = len >= 3 && line[len - 3] == '*';
    uint8_t x = 0, payload = ok ? (uint8_t)(len - 3) : 0;
    for (uint8_t i = 0; i < payload; i++) x ^= (uint8_t)line[i];
    uint8_t hi = ok ? hexVal(line[len - 2]) : 0xFF, lo = ok ? hexVal(line[len - 1]) : 0xFF;
    if (!ok || hi > 15 || lo > 15 || (uint8_t)(hi << 4 | lo) != x) {
      Serial.println(F("ERR 1"));
    } else if (payload == 1 && line[0] == 'F') {
      Serial.print(F("FPS "));
      Serial.println(fps);
    } else {
      Serial.print(F("OK "));
      Serial.println(payload);
    }
  }
  len = 0;
  overflow = false;
}

static void addChar(char c) {
  if (c == '\r') return;
  if (c == '\n') return handleLine();
  if (len < MAX_LINE) line[len++] = c;
  else overflow = true;
}

static void pollNaive() {
  while (Serial.available()) addChar((char)Serial.read());
}

static void pollWake() {
  if (!Serial.available()) return;
  while (Serial.available()) Serial.read();
  Serial.write('!');
  len = 0;
  overflow = false;
  uint32_t start = millis();
  while (millis() - start < 30) {
    if (!Serial.available()) continue;
    char c = (char)Serial.read();
    if (c == 0x01) {  // the host retried its wake byte: we're still listening
      Serial.write('!');
      continue;
    }
    if (c == '\n') return handleLine();
    addChar(c);
  }
  len = 0;  // timed out: drop the partial line, the host retries
}

void setup() {
  FastLED.addLeds<WS2812B, 2, GRB>(leds, 0, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, 3, GRB>(leds, LEDS_PER_STRIP, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, 4, GRB>(leds, 2 * LEDS_PER_STRIP, LEDS_PER_STRIP);
  FastLED.clear(true);
  Serial.begin(115200);
  engine.loadStyle(core::STYLE_ALARM);
  engine.setRate(1000);
  for (;;) {
    int c = Serial.read();
    if (c == 'n' || c == 'w') {
      wakeMode = c == 'w';
      break;
    }
  }
  Serial.println(wakeMode ? F("mode wake") : F("mode naive"));
  lastUs = fpsStartUs = micros();
}

void loop() {
  uint32_t now = micros();
  engine.tick(now - lastUs);
  lastUs = now;
  engine.render(frame);
  FastLED.setBrightness(engine.outputBrightness());
  FastLED.show();
  frames++;
  if (now - fpsStartUs >= 1000000UL) {
    fps = frames;
    frames = 0;
    fpsStartUs += 1000000UL;
  }
  if (wakeMode) pollWake();
  else pollNaive();
}
