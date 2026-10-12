<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConnectionStore } from '../stores/connection'

const connection = useConnectionStore()
const { status, error } = storeToRefs(connection)

const LABELS = {
  unsupported: 'Web Serial unavailable: use Chrome',
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
} as const

const label = computed(() => LABELS[status.value])
const canConnect = computed(() => status.value === 'idle')
</script>

<template>
  <div class="connection">
    <span
      class="pill"
      :class="status"
      role="status"
      data-testid="connection-status"
    >{{ label }}</span>
    <button
      v-if="canConnect"
      type="button"
      class="primary"
      @click="connection.connect()"
    >
      Connect
    </button>
    <span
      v-if="error"
      class="error"
      role="alert"
    >{{ error }}</span>
  </div>
</template>

<style scoped>
.connection {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  background: var(--surface);
  font-weight: 600;
}

.pill::before {
  content: '';
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: var(--muted);
}

.pill.connected::before {
  background: var(--ok);
}

.pill.connecting::before,
.pill.reconnecting::before {
  background: var(--warn);
}

.pill.unsupported::before {
  background: var(--danger);
}

.error {
  color: var(--danger);
}
</style>
