<script setup lang="ts">
// Modal for questions from the dialog store. Esc or Cancel answers null.
import { nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDialogStore } from '../stores/dialog'

const dialog = useDialogStore()
const { request } = storeToRefs(dialog)
const box = ref<HTMLElement | null>(null)

watch(request, async (r) => {
  if (!r) return
  await nextTick()
  box.value?.querySelector<HTMLButtonElement>('button.primary, button.danger')?.focus()
})
</script>

<template>
  <div
    v-if="request"
    class="backdrop"
    @click.self="dialog.answer(null)"
  >
    <div
      ref="box"
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-message"
      @keydown.esc.stop="dialog.answer(null)"
    >
      <p id="dialog-message">
        {{ request.message }}
      </p>
      <div class="buttons">
        <button
          v-if="request.cancel !== null"
          type="button"
          @click="dialog.answer(null)"
        >
          {{ request.cancel }}
        </button>
        <button
          v-for="b in request.buttons"
          :key="b.value"
          type="button"
          :class="b.kind"
          @click="dialog.answer(b.value)"
        >
          {{ b.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 0.6);
}

.dialog {
  min-width: 20rem;
  max-width: 90vw;
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--panel);
}

p {
  margin: 0 0 1.25rem;
  font-size: 1.15rem;
}

.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
</style>
