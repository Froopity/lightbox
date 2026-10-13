<script setup lang="ts">
// Export / Import of the preset list as a JSON file (PLAN.md §5).
import { ref } from 'vue'
import { exportDocument, exportFilename, parseImport } from '../presets/preset'
import { useDialogStore } from '../stores/dialog'
import { useEditorStore } from '../stores/editor'
import { useLiveStore } from '../stores/live'
import { usePresetsStore } from '../stores/presets'

const presets = usePresetsStore()
const dialog = useDialogStore()
const editor = useEditorStore()
const live = useLiveStore()
const fileInput = ref<HTMLInputElement | null>(null)

function exportPresets(): void {
  const now = new Date()
  const blob = new Blob([JSON.stringify(exportDocument(presets.presets, now), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = exportFilename(now)
  a.click()
  URL.revokeObjectURL(a.href)
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // so picking the same file again still fires
  if (!file) return
  const result = parseImport(await file.text())
  if ('error' in result) {
    await dialog.inform(`Import failed: ${result.error}`)
    return
  }
  const n = result.presets.length
  const plural = n === 1 ? 'preset' : 'presets'
  const choice = await dialog.ask(`Import ${n} ${plural} from ${file.name}?`, [
    { label: 'Merge', value: 'merge', kind: 'primary' },
    { label: 'Replace', value: 'replace', kind: 'danger' },
  ])
  if (choice === null) return
  if (choice === 'replace') {
    const ok = await dialog.confirm(`Replace all ${presets.presets.length} presets with the ${n} imported?`, 'Replace', 'danger')
    if (!ok) return
  }
  if (!(await editor.confirmDiscard())) return
  editor.close()
  if (choice === 'merge') {
    presets.merge(result.presets)
  } else {
    presets.replace(result.presets)
    if (!presets.byId(live.activeId)) live.activeId = null
  }
}
</script>

<template>
  <div class="transfer">
    <button
      type="button"
      @click="exportPresets"
    >
      Export
    </button>
    <button
      type="button"
      @click="fileInput?.click()"
    >
      Import
    </button>
    <input
      ref="fileInput"
      type="file"
      accept=".json,application/json"
      hidden
      data-testid="import-file"
      @change="onFile"
    >
  </div>
</template>

<style scoped>
.transfer {
  display: flex;
  gap: 0.5rem;
}
</style>
