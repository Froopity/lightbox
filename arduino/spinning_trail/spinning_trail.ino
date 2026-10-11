#include <FastLED.h>

#define LEDS_PER_STRIP 17
#define NUM_STRIPS     3
#define NUM_LEDS       (LEDS_PER_STRIP * NUM_STRIPS)

#define STRIP_1_PIN    2
#define STRIP_2_PIN    3
#define STRIP_3_PIN    4

// --- CONFIGURATION ---
#define NUM_DOTS       4    // Set this to any number of dots you want
#define TRAIL_LENGTH   25 
#define FADE_AMOUNT    (255 / TRAIL_LENGTH) 
// ---------------------

CRGB leds[NUM_LEDS];
uint8_t gHue = 0; 

void setup() {
  FastLED.addLeds<WS2812B, STRIP_1_PIN, GRB>(leds, 0, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, STRIP_2_PIN, GRB>(leds, LEDS_PER_STRIP, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, STRIP_3_PIN, GRB>(leds, 2 * LEDS_PER_STRIP, LEDS_PER_STRIP);

  FastLED.setBrightness(50);
  FastLED.clear();
}

void loop() {
  // Loop through the total number of LEDs to drive the animation forward
  for (int i = 0; i < NUM_LEDS; i++) {
    // Fade all existing trails down by a fraction
    fadeToBlackBy(leds, NUM_LEDS, FADE_AMOUNT);

    // Calculate and draw the position for each dot
    for (int d = 0; d < NUM_DOTS; d++) {
      // Space dots evenly across the total length of the strip
      int dotSpacing = NUM_LEDS / NUM_DOTS;
      int dotPosition = (i + (d * dotSpacing)) % NUM_LEDS;

      // Draw the dot using the identical hue
      leds[dotPosition] = CHSV(gHue, 255, 255);
    }

    FastLED.show();
    delay(40); 
    
    if (i % 5 == 0) {
      gHue += 1; 
    }
  }
}