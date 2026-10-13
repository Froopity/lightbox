<script setup lang="ts">
// Preset list: drag handle, 1–9 badge, name, ✎, active radio, ↻ on the active row, `+` at the bottom.
// Reorder by dragging the handle, or with ↑/↓ while the handle has focus.
import { nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ResetButton from './ResetButton.vue'
import { useEditorStore } from '../stores/editor'
import { useLiveStore } from '../stores/live'
import { usePresetsStore } from '../stores/presets'

const store = usePresetsStore()
const editor = useEditorStore()
const { presets } = storeToRefs(store)
const { activeId } = storeToRefs(useLiveStore())
const { editingId, isOpen } = storeToRefs(editor)

const dragFrom = ref<number | null>(null)
const dropAt = ref<number | null>(null)
const list = ref<HTMLElement | null>(null)

function onDragStart(e: DragEvent, i: number): void {
  dragFrom.value = i
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
    const row = (e.target as HTMLElement).closest('li')
    if (row) e.dataTransfer.setDragImage(row, 16, 16)
  }
}

function onDragOver(e: DragEvent, i: number): void {
  if (dragFrom.value === null) return
  e.preventDefault()
  dropAt.value = i
}

function onDrop(i: number): void {
  if (dragFrom.value !== null) store.move(dragFrom.value, i)
  onDragEnd()
}

function onDragEnd(): void {
  dragFrom.value = dropAt.value = null
}

async function onHandleKey(e: KeyboardEvent, i: number): Promise<void> {
  const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null
  if (to === null || to < 0 || to >= presets.value.length) return
  e.preventDefault()
  store.move(i, to)
  await nextTick()
  list.value?.querySelectorAll<HTMLElement>('.handle')[to]?.focus()
}

const isEditing = (id: string): boolean => isOpen.value && editingId.value === id
</script>

<template>
  <div class="presets">
    <ul
      ref="list"
      class="list"
      role="radiogroup"
      aria-label="Active preset"
    >
      <li
        v-for="(p, i) in presets"
        :key="p.id"
        class="row"
        :class="{ active: p.id === activeId, editing: isEditing(p.id), dragging: dragFrom === i, target: dropAt === i && dragFrom !== i }"
        data-testid="preset-row"
        @click="editor.select(p.id)"
        @dragover="onDragOver($event, i)"
        @drop.prevent="onDrop(i)"
      >
        <button
          type="button"
          class="handle"
          draggable="true"
          :aria-label="`Move ${p.name} (arrow keys)`"
          title="Drag to reorder"
          @click.stop
          @keydown="onHandleKey($event, i)"
          @dragstart="onDragStart($event, i)"
          @dragend="onDragEnd"
        >
          ⠿
        </button>
        <span
          class="badge"
          :class="{ none: i >= 9 }"
          aria-hidden="true"
        >{{ i < 9 ? i + 1 : '' }}</span>
        <span class="name">{{ p.name }}</span>
        <ResetButton
          v-if="p.id === activeId"
          :label="`Reload ${p.name}`"
          @click="editor.reload(p.id)"
        />
        <button
          type="button"
          class="icon edit"
          :aria-label="`Edit ${p.name}`"
          :aria-pressed="isEditing(p.id)"
          title="Edit"
          @click.stop="editor.edit(p.id)"
        >
          ✎
        </button>
        <button
          type="button"
          role="radio"
          class="radio"
          :aria-checked="p.id === activeId"
          :aria-label="`Select ${p.name}`"
          @click.stop="editor.select(p.id)"
        />
      </li>
    </ul>
    <p
      v-if="presets.length === 0"
      class="empty"
    >
      No presets. Press + to create one.
    </p>
    <button
      type="button"
      class="add"
      aria-label="New preset"
      title="New preset"
      @click="editor.create()"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.presets {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 0 0 4.5rem;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 3.5rem;
  padding: 0.35rem 0.6rem 0.35rem 0.25rem;
  border: 2px solid var(--border);
  border-radius: 0.6rem;
  background: var(--surface);
  cursor: pointer;
  user-select: none;
}

.row:hover {
  border-color: var(--muted);
}

.row.active {
  border-color: var(--accent);
  background: var(--active-bg);
}

.row.editing {
  outline: 2px dashed var(--accent);
  outline-offset: 2px;
}

.row.dragging {
  opacity: 0.4;
}

.row.target {
  box-shadow: 0 -3px 0 var(--fg);
}

.handle {
  min-height: 2.75rem;
  width: 2rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--muted);
  font-size: 1.3rem;
  cursor: grab;
}

.badge {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 0.3rem;
  background: var(--bg);
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 700;
}

.badge.none {
  visibility: hidden;
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.1rem;
  font-weight: 600;
}

.icon {
  width: 2.75rem;
  padding: 0;
  border: none;
  background: none;
  font-size: 1.3rem;
}

.icon:hover {
  background: var(--bg);
}

.radio {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.75rem;
  padding: 0;
  border: none;
  background: none;
}

.radio::before {
  content: '';
  width: 1.3rem;
  height: 1.3rem;
  box-sizing: border-box;
  border: 2px solid var(--fg);
  border-radius: 50%;
}

.radio[aria-checked='true']::before {
  border-color: var(--accent);
  background: radial-gradient(var(--accent) 0 45%, transparent 50%);
}

.empty {
  color: var(--muted);
}

.add {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 3.5rem;
  height: 3.5rem;
  padding: 0;
  font-size: 1.8rem;
  line-height: 1;
}
</style>
