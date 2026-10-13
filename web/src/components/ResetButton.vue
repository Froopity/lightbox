<script setup lang="ts">
// ↻ for every reset/reload: a plain icon button, like ✎.
defineProps<{ label: string }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="reset"
    :aria-label="label"
    :title="label"
    @click.stop="$emit('click')"
  >
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </svg>
  </button>
</template>

<style scoped>
.reset {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  min-height: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--fg);
}

.reset:hover {
  background: var(--bg);
}

svg {
  width: 1.4rem;
  height: 1.4rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
