<script setup lang="ts">
import { useId } from 'vue'
// A labelled horizontal slider with end labels ("slow…fast") or a value readout.
withDefaults(
  defineProps<{
    label: string
    modelValue: number
    min?: number
    max?: number
    step?: number
    low?: string
    high?: string
    valueText?: string
  }>(),
  { min: 0, max: 1, step: 0.001, low: undefined, high: undefined, valueText: undefined },
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const id = useId()

function onInput(e: Event): void {
  emit('update:modelValue', Number((e.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="slider-field">
    <div class="head">
      <label :for="id">{{ label }}</label>
      <output
        v-if="valueText !== undefined"
        :for="id"
      >{{ valueText }}</output>
    </div>
    <div class="row">
      <input
        :id="id"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        @input="onInput"
      >
      <slot />
    </div>
    <div
      v-if="low || high"
      class="ends"
      aria-hidden="true"
    >
      <span>{{ low }}</span><span>{{ high }}</span>
    </div>
  </div>
</template>

<style scoped>
.slider-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.head {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
}

output {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

input {
  flex: 1;
  min-width: 0;
}

.ends {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
