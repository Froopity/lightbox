<script setup lang="ts">
// Edit/Create panel: changes are previewed live; Save stores them, ✕ throws them away (PLAN.md §5).
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import SliderField from './SliderField.vue'
import { MAX_NAME } from '../presets/preset'
import { STYLES, styleByKey } from '../styles/registry'
import type { ParamSpec } from '../styles/types'
import { useEditorStore } from '../stores/editor'

const editor = useEditorStore()
const { draft, isNew, dirty } = storeToRefs(editor)
const style = computed(() => (draft.value ? styleByKey(draft.value.style) : undefined))

/** wire × scale + unit, e.g. "2.5 cols". */
function paramText(p: ParamSpec, wire: number): string {
  const v = Number((wire * p.scale).toFixed(2))
  return p.unit ? `${v} ${p.unit}` : String(v)
}

const value = (e: Event): string => (e.target as HTMLInputElement | HTMLSelectElement).value
</script>

<template>
  <form
    v-if="draft && style"
    class="editor"
    aria-label="Preset editor"
    @submit.prevent="editor.save()"
  >
    <button
      type="button"
      class="close"
      aria-label="Close editor and discard changes"
      title="Discard changes"
      @click="editor.discard()"
    >
      ✕
    </button>
    <p class="mode">
      {{ isNew ? 'New preset' : 'Editing' }}<span
        v-if="dirty"
        class="dirty"
      > · unsaved</span>
    </p>

    <label class="field">
      <span>Name</span>
      <input
        type="text"
        :value="draft.name"
        :maxlength="MAX_NAME"
        :placeholder="style.name"
        @input="editor.setName(value($event))"
      >
    </label>

    <label class="field">
      <span>Style</span>
      <select
        :value="draft.style"
        @change="editor.setStyle(value($event))"
      >
        <option
          v-for="s in STYLES"
          :key="s.key"
          :value="s.key"
        >{{ s.name }}</option>
      </select>
    </label>

    <fieldset class="field">
      <legend>{{ style.colors === 1 ? 'Colour' : 'Colours' }}</legend>
      <div class="swatches">
        <input
          v-for="(c, i) in draft.colors"
          :key="i"
          type="color"
          :value="c.toLowerCase()"
          :aria-label="`Colour ${i + 1}`"
          @input="editor.setColor(i, value($event))"
        >
      </div>
    </fieldset>

    <SliderField
      label="Rate"
      low="slow"
      high="fast"
      :model-value="draft.rate"
      @update:model-value="editor.setRate"
    />
    <SliderField
      label="Brightness"
      low="dark"
      high="bright"
      :model-value="draft.brightness"
      @update:model-value="editor.setBrightness"
    />
    <SliderField
      v-for="p in style.params"
      :key="p.key"
      :label="p.label"
      :min="p.wireMin"
      :max="p.wireMax"
      :step="1"
      :value-text="paramText(p, draft.params[p.key] ?? p.default)"
      :model-value="draft.params[p.key] ?? p.default"
      @update:model-value="editor.setParam(p.key, $event)"
    />

    <div class="footer">
      <button
        type="submit"
        class="primary save"
      >
        Save
      </button>
      <div
        v-if="!isNew"
        class="secondary"
      >
        <button
          type="button"
          @click="editor.duplicate()"
        >
          Duplicate
        </button>
        <button
          type="button"
          class="danger"
          @click="editor.remove()"
        >
          Delete
        </button>
      </div>
    </div>
  </form>
  <p
    v-else
    class="hint"
  >
    ✎ a preset or + to create one
  </p>
</template>

<style scoped>
.editor {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 100%;
}

.close {
  position: absolute;
  top: -0.5rem;
  right: -0.5rem;
  width: 2.75rem;
  padding: 0;
  border: none;
  background: none;
  font-size: 1.5rem;
}

.close:hover {
  background: var(--surface);
}

.mode {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.dirty {
  color: var(--warn);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  border: none;
  font-weight: 600;
}

legend {
  padding: 0;
  margin-bottom: 0.35rem;
}

input[type='text'],
select {
  font: inherit;
  font-weight: 400;
  font-size: 1.05rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--fg);
}

.swatches {
  display: flex;
  gap: 0.75rem;
}

input[type='color'] {
  width: 3rem;
  height: 3rem;
  padding: 0.15rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  cursor: pointer;
}

.footer {
  position: sticky;
  bottom: -1.25rem; /* the panel's padding: stay visible while the fields scroll */
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: auto -0.25rem -1.25rem;
  padding: 0.75rem 0.25rem 1.25rem;
  background: var(--panel);
}

.save {
  font-size: 1.1rem;
}

.secondary {
  display: flex;
  gap: 0.6rem;
}

.secondary button {
  flex: 1;
}

.hint {
  display: grid;
  place-items: center;
  height: 100%;
  margin: 0;
  color: var(--muted);
  text-align: center;
}
</style>
