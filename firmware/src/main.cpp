// Arduino glue: FastLED setup, layout mapping, serial I/O, frame loop.
// Phase 0: blank sketch that lights nothing.
#include <Arduino.h>
#include <FastLED.h>

#include "layout.h"

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2812B, 2, GRB>(leds, 0, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, 3, GRB>(leds, LEDS_PER_STRIP, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, 4, GRB>(leds, 2 * LEDS_PER_STRIP, LEDS_PER_STRIP);
  FastLED.clear(true);
}

void loop() {}
