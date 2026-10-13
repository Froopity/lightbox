<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGlobalStore } from '../stores/global'

const global = useGlobalStore()
const { blackout } = storeToRefs(global)
</script>

<template>
  <button
    type="button"
    class="blackout"
    :class="{ on: blackout }"
    :aria-pressed="blackout"
    title="Blackout (B)"
    @click="global.toggleBlackout()"
  >
    {{ blackout ? 'Blackout ON' : 'Blackout' }}
  </button>
</template>

<style scoped>
.blackout.on {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
  animation: pulse 1s ease-in-out infinite alternate;
}

@keyframes pulse {
  to {
    box-shadow: 0 0 0 0.35rem rgb(229 72 77 / 0.35);
  }
}
</style>
