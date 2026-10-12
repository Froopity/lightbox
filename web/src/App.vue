<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import ConnectionPill from './components/ConnectionPill.vue'
import StylePicker from './components/StylePicker.vue'
import { useConnectionStore } from './stores/connection'
import { useLiveStore } from './stores/live'

const connection = useConnectionStore()
const live = useLiveStore()
const { status } = storeToRefs(connection)

onMounted(() => {
  connection.setResync(live.resyncCommands)
  void connection.init()
})
</script>

<template>
  <div class="app">
    <div
      v-if="status === 'reconnecting'"
      class="banner"
      role="alert"
    >
      Disconnected — reconnecting
    </div>
    <header class="topbar">
      <h1>Lightbox</h1>
      <ConnectionPill />
    </header>
    <main>
      <section class="panel">
        <StylePicker />
      </section>
    </main>
  </div>
</template>

<style scoped>
.banner {
  background: var(--danger);
  color: #fff;
  font-weight: 700;
  font-size: 1.1rem;
  padding: 0.75rem 1rem;
  text-align: center;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

h1 {
  margin: 0;
  font-size: 1.4rem;
  letter-spacing: 0.04em;
}

main {
  padding: 1.25rem;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.25rem;
  max-width: 32rem;
}
</style>
