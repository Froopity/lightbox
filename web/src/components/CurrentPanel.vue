<script setup lang="ts">
// Current: the live rate and brightness (`R`/`B`). They never change the preset; ↻ returns each to it.
import { storeToRefs } from 'pinia'
import ResetButton from './ResetButton.vue'
import SliderField from './SliderField.vue'
import { useLiveStore } from '../stores/live'

const live = useLiveStore()
const { current } = storeToRefs(live)
</script>

<template>
  <div class="current">
    <SliderField
      label="Rate"
      low="slow"
      high="fast"
      :model-value="current.rate"
      @update:model-value="live.setRate"
    >
      <ResetButton
        label="Reset rate to preset"
        @click="live.resetRate()"
      />
    </SliderField>
    <SliderField
      label="Brightness"
      low="dark"
      high="bright"
      :model-value="current.brightness"
      @update:model-value="live.setBrightness"
    >
      <ResetButton
        label="Reset brightness to preset"
        @click="live.resetBrightness()"
      />
    </SliderField>
  </div>
</template>

<style scoped>
.current {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
</style>
