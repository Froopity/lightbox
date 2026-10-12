// Arduino glue: FastLED setup, layout mapping, serial I/O, frame loop.
// Effects render straight into leds[] through the layout map (no second frame buffer).
// With -DDEMO (env:demo): cycles Ominous → Alarm every 10 s, stepping rate 0 → 0.5 → 1 each cycle,
// and logs each step with the measured fps over serial.
#include <Arduino.h>
#include <FastLED.h>

#include "core.h"
#include "layout.h"

static_assert(sizeof(CRGB) == sizeof(core::Rgb), "core::Rgb must match CRGB's layout");
static_assert(NUM_STRIPS == core::ROWS && LEDS_PER_STRIP == core::COLS, "layout.h must match core geometry");

CRGB leds[NUM_LEDS];
core::Engine engine;
core::Frame frame{reinterpret_cast<core::Rgb*>(leds), ledIndex};

static uint32_t lastUs;
static uint16_t frames;    // frames since the last fps sample
static uint32_t fpsStartUs;
static uint16_t fps;       // measured over the last second

#ifdef DEMO
static const uint32_t DEMO_STEP_US = 10000000UL;
static const uint16_t DEMO_RATES[] = {0, 500, 1000};
static uint8_t demoStep;
static uint32_t demoStartUs;

static void demoApply() {
  uint8_t style = demoStep % 2 == 0 ? core::STYLE_OMINOUS : core::STYLE_ALARM;
  engine.setRate(DEMO_RATES[(demoStep / 2) % 3]);
  engine.loadStyle(style);
  Serial.print(F("demo: "));
  Serial.print(style == core::STYLE_OMINOUS ? F("ominous") : F("alarm"));
  Serial.print(F(" rate "));
  Serial.print(engine.rate());
  Serial.print(F(" fps "));
  Serial.println(fps);
}
#endif

void setup() {
  FastLED.addLeds<WS2812B, 2, GRB>(leds, 0, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, 3, GRB>(leds, LEDS_PER_STRIP, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, 4, GRB>(leds, 2 * LEDS_PER_STRIP, LEDS_PER_STRIP);
  FastLED.clear(true);
#ifdef DEMO
  Serial.begin(115200);
  demoApply();
  demoStartUs = micros();
#endif
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

#ifdef DEMO
  if (now - demoStartUs >= DEMO_STEP_US) {
    demoStartUs += DEMO_STEP_US;
    demoStep = (uint8_t)((demoStep + 1) % 6);
    demoApply();
  }
#endif
}
