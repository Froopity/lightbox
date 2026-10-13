<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import AppDialog from './components/AppDialog.vue'
import BlackoutButton from './components/BlackoutButton.vue'
import ConnectionPill from './components/ConnectionPill.vue'
import GlobalBrightness from './components/GlobalBrightness.vue'
import PresetEditor from './components/PresetEditor.vue'
import PresetList from './components/PresetList.vue'
import PresetTransfer from './components/PresetTransfer.vue'
import { useShortcuts } from './composables/useShortcuts'
import { useConnectionStore } from './stores/connection'
import { useLiveStore } from './stores/live'
import { usePresetsStore } from './stores/presets'

const connection = useConnectionStore()
const live = useLiveStore()
const presets = usePresetsStore()
const { status } = storeToRefs(connection)

useShortcuts()

onMounted(() => {
  // The first preset is active on load; the connect resend puts it on the board.
  const first = presets.presets[0]
  if (first) live.show(first, first.id)
  connection.setResync(live.resyncCommands)
  void connection.init()
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <h1>Lightbox</h1>
      <ConnectionPill />
      <div class="spacer" />
      <BlackoutButton />
      <PresetTransfer />
    </header>
    <div
      v-if="status === 'reconnecting'"
      class="banner"
      role="alert"
    >
      Disconnected — reconnecting
    </div>
    <main class="columns">
      <section
        class="column"
        aria-labelledby="h-presets"
      >
        <h2 id="h-presets">
          Presets
        </h2>
        <div class="panel presets">
          <PresetList />
        </div>
      </section>
      <section
        class="column"
        aria-labelledby="h-editor"
      >
        <h2 id="h-editor">
          Edit/Create
        </h2>
        <div class="panel editor">
          <PresetEditor />
        </div>
      </section>
      <section
        class="column brightness"
        aria-labelledby="h-brightness"
      >
        <h2 id="h-brightness">
          Brightness
        </h2>
        <GlobalBrightness />
      </section>
    </main>
    <AppDialog />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.6rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

h1 {
  margin: 0;
  font-size: 1.3rem;
  letter-spacing: 0.04em;
}

.spacer {
  flex: 1;
}

.banner {
  background: var(--danger);
  color: #fff;
  font-weight: 700;
  font-size: 1.1rem;
  padding: 0.75rem 1rem;
  text-align: center;
}

.columns {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(18rem, 1fr) minmax(20rem, 24rem) 8rem;
  gap: 1.5rem;
  padding: 1rem 1.5rem 1.5rem;
}

.column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.4rem;
  font-weight: 600;
}

.brightness h2 {
  text-align: center;
}

.panel {
  flex: 1;
  min-height: 0;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: var(--panel);
}

.panel.editor {
  overflow-y: auto;
  padding: 1.25rem;
}
</style>
