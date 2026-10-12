<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { STYLES } from '../styles/registry'
import { useLiveStore } from '../stores/live'

const live = useLiveStore()
const { style } = storeToRefs(live)

function onChange(e: Event): void {
  live.selectStyle(Number((e.target as HTMLSelectElement).value))
}
</script>

<template>
  <label class="field">
    <span>Effect</span>
    <select
      :value="style"
      @change="onChange"
    >
      <option
        v-for="s in STYLES"
        :key="s.id"
        :value="s.id"
      >{{ s.name }}</option>
    </select>
  </label>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-weight: 600;
}

select {
  font: inherit;
  font-size: 1.15rem;
  padding: 0.6rem 0.8rem;
  min-width: 16rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--fg);
}
</style>
