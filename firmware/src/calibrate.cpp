// Calibration sketch (env:calibrate).
// Each strip: LED 0 white, LEDs 1–3 in the strip's colour (pin 2 red, pin 3 green,
// pin 4 blue) at decreasing brightness to show direction. Everything else off.
//
// With -DVERIFY_LAYOUT (env:verify): logical column 0 lit white on every row, plus a
// dot sweeping logical columns 0→16 on row 0 only, using layout.h.
#include <Arduino.h>
#include <FastLED.h>

#include "layout.h"

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2812B, 2, GRB>(leds, 0, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, 3, GRB>(leds, LEDS_PER_STRIP, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, 4, GRB>(leds, 2 * LEDS_PER_STRIP, LEDS_PER_STRIP);
  FastLED.setBrightness(64);
  FastLED.clear(true);
}

#ifndef VERIFY_LAYOUT

void loop() {
  static const CRGB STRIP_COLOR[NUM_STRIPS] = {CRGB::Red, CRGB::Green, CRGB::Blue};
  static const uint8_t LEVEL[3] = {255, 96, 32};
  FastLED.clear();
  for (uint8_t s = 0; s < NUM_STRIPS; s++) {
    uint8_t base = s * LEDS_PER_STRIP;
    leds[base] = CRGB::White;
    for (uint8_t i = 0; i < 3; i++) {
      CRGB c = STRIP_COLOR[s];
      c.nscale8_video(LEVEL[i]);
      leds[base + 1 + i] = c;
    }
  }
  FastLED.show();
  delay(100);
}

#else

void loop() {
  static uint8_t sweep = 0;
  FastLED.clear();
  for (uint8_t r = 0; r < NUM_STRIPS; r++) leds[ledIndex(r, 0)] = CRGB::White;
  if (sweep != 0) leds[ledIndex(0, sweep)] = CRGB::Orange;
  FastLED.show();
  sweep = (uint8_t)((sweep + 1) % LEDS_PER_STRIP);
  delay(sweep == 1 ? 1500 : 400);  // linger on column 0 so the start is obvious
}

#endif
