#include <FastLED.h>

// ==========================================
// 1. HARDWARE CONFIGURATION
// ==========================================
#define NUM_STRIPS 3
#define LEDS_PER_STRIP 17
#define NUM_LEDS (NUM_STRIPS * LEDS_PER_STRIP)

// ==========================================
// 2. VISUAL & TIMING CONFIGURATION (Tweak here!)
// ==========================================
const CRGB PulseColor     = CRGB::Amethyst; 

const uint16_t WompDurationMs = 900;  // Time (ms) for the pulse to climb the strips
const uint16_t WaveDelayMs    = 500;  // Time (ms) of darkness/idle at the bottom
const uint16_t StripOffsetMs  = 160;  // Stagger between strips. Lower = more overlap/fluid handoff

// Crucial Workaround #2: Set a tiny baseline brightness (0-255) so the LEDs 
// never drop into the jagged absolute-zero PWM zone. 
const uint8_t MinBrightnessFloor = 2; 

// ==========================================
// GLOBALS & SETUP
// ==========================================
CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2812B, 2, GRB>(leds, 0, LEDS_PER_STRIP);
  FastLED.addLeds<WS2812B, 3, GRB>(leds, 17, 17);
  FastLED.addLeds<WS2812B, 4, GRB>(leds, 34, 17);

  FastLED.clear();
  
  // Keep global brightness maxed so FastLED has full 8-bit depth 
  // to execute its temporal dithering cycles perfectly.
  FastLED.setBrightness(255); 
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  // Convert standard millisecond constants to microseconds for sub-milli precision
  uint32_t wompDuration = (uint32_t)WompDurationMs * 1000;
  uint32_t waveDelay    = (uint32_t)WaveDelayMs * 1000;
  uint32_t stripOffset  = (uint32_t)StripOffsetMs * 1000;
  uint32_t totalCycleTime = wompDuration + waveDelay;

  uint32_t currentTime = micros();
  uint32_t cycleTime = currentTime % totalCycleTime;

  FastLED.clear();

  // Create the baseline color floor
  CRGB floorColor = PulseColor;
  floorColor.nscale8_video(MinBrightnessFloor);

  if (cycleTime < wompDuration) {
    for (uint8_t strip = 0; strip < NUM_STRIPS; strip++) {
      
      uint32_t stripDelay = strip * stripOffset;
      uint8_t intensity = 0;

      if (cycleTime >= stripDelay) {
        uint32_t localProgress = cycleTime - stripDelay;
        uint32_t waveLength = wompDuration - (stripOffset * (NUM_STRIPS - 1));

        if (localProgress < waveLength) {
          // Microsecond accurate mapping to 0-128 sine window
          uint8_t angle = (localProgress * 128) / waveLength;
          intensity = sin8(angle); 
          
          // Apply the exponential audio-feel curve
          intensity = dim8_video(intensity);
        }
      }

      // Crucial Workaround #1 & #3: Use FastLED's 16-bit blend engine instead of nscale.
      // This blends our target color seamlessly over our baseline floor color, 
      // triggering temporal dithering for sub-step smoothing.
      CRGB stripColor = blend(floorColor, PulseColor, intensity);

      // Uniformly update the active strip
      uint16_t startLED = strip * LEDS_PER_STRIP;
      for (uint8_t i = 0; i < LEDS_PER_STRIP; i++) {
        leds[startLED + i] = stripColor;
      }
    }
  } else {
    // If we are in the WaveDelayMs zone, fill all strips with the static floor color
    for (uint8_t i = 0; i < NUM_LEDS; i++) {
      leds[i] = floorColor;
    }
  }

  FastLED.show();
  
  // 1 millisecond sync pause gives FastLED breathing room to execute 
  // dithering passes without stalling the master clock loop.
  delayMicroseconds(1000); 
}