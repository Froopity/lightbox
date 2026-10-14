<script setup lang="ts">
// LFO: moves the live rate or brightness on the board. Off by default and after every preset load.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import SliderField from './SliderField.vue'
import { hzFromPosition, positionFromHz, useLfoStore, type LfoDestination } from '../stores/lfo'

const lfo = useLfoStore()
const { on, target, hz, depth } = storeToRefs(lfo)

const position = computed(() => positionFromHz(hz.value))
const hzText = computed(() => `${hz.value < 1 ? hz.value.toFixed(2) : hz.value.toFixed(1)} Hz`)
const depthText = computed(() => `${Math.round(depth.value * 100)}%`)

function onToggle(e: Event): void {
  lfo.setOn((e.target as HTMLInputElement).checked)
}

function onTarget(e: Event): void {
  lfo.setTarget((e.target as HTMLSelectElement).value as LfoDestination)
}
</script>

<template>
  <div class="lfo">
    <div class="top">
      <h3 id="h-lfo">
        LFO
      </h3>
      <label class="enable">
        <span>Enable</span>
        <input
          type="checkbox"
          role="switch"
          :checked="on"
          @change="onToggle"
        >
      </label>
    </div>
    <label class="field">
      Destination
      <select
        :value="target"
        @change="onTarget"
      >
        <option value="rate">Rate</option>
        <option value="brightness">Brightness</option>
      </select>
    </label>
    <SliderField
      label="Rate"
      low="slow"
      high="fast"
      :value-text="hzText"
      :model-value="position"
      @update:model-value="(u) => lfo.setHz(hzFromPosition(u))"
    />
    <SliderField
      label="Intensity"
      low="low"
      high="high"
      :value-text="depthText"
      :model-value="depth"
      @update:model-value="lfo.setDepth"
    />
  </div>
</template>

<style scoped>
.lfo {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h3 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
}

.enable {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.85rem;
  color: var(--muted);
  cursor: pointer;
}

/* A native checkbox drawn as a switch. */
.enable input {
  appearance: none;
  position: relative;
  width: 3.5rem;
  height: 1.9rem;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: var(--surface);
  cursor: pointer;
  transition: background 0.15s;
}

.enable input::after {
  content: '';
  position: absolute;
  top: 0.2rem;
  left: 0.25rem;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: var(--muted);
  transition: transform 0.15s, background 0.15s;
}

.enable input:checked {
  background: var(--accent);
  border-color: var(--accent);
}

.enable input:checked::after {
  background: #fff;
  transform: translateX(1.55rem);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-weight: 600;
}

select {
  font: inherit;
  font-weight: 400;
  font-size: 1.05rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--fg);
}
</style>
