<script setup lang="ts">
// Global brightness: a tall vertical slider (top = 100%, bottom = off) with a ↻ to 100% below it.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import ResetButton from './ResetButton.vue'
import { refuseFocus } from '../composables/useShortcuts'
import { useGlobalStore } from '../stores/global'

const global = useGlobalStore()
const { level, blackout } = storeToRefs(global)
const percent = computed(() => `${Math.round(level.value * 100)}%`)

function onInput(e: Event): void {
  global.setLevel(Number((e.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="global">
    <output
      for="global-brightness"
      class="value"
    >{{ percent }}</output>
    <input
      id="global-brightness"
      type="range"
      min="0"
      max="1"
      step="0.001"
      aria-label="Global brightness"
      :aria-valuetext="percent"
      :value="level"
      tabindex="-1"
      @focus="refuseFocus"
      @input="onInput"
    >
    <ResetButton
      label="Global brightness to 100%"
      @click="global.setLevel(1)"
    />
    <div
      v-if="blackout"
      class="blackout"
      role="status"
    >
      Blackout
    </div>
  </div>
</template>

<style scoped>
.global {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  height: 100%;
}

.value {
  font-weight: 700;
  font-size: 1.2rem;
  font-variant-numeric: tabular-nums;
}

input {
  flex: 1;
  min-height: 12rem;
  width: 3rem;
  writing-mode: vertical-lr;
  direction: rtl;
  accent-color: var(--fg);
}

.blackout {
  padding: 0.3rem 0.6rem;
  border-radius: 0.35rem;
  background: var(--danger);
  color: #fff;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
