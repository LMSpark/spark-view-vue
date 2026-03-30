<template>
  <div class="spark-json-editor" :style="rootStyle">
    <div v-if="initError" class="spark-json-editor__notice">
      {{ initError }}
    </div>
    <textarea
      v-if="initError"
      :value="modelValue"
      class="spark-json-editor__fallback"
      :readonly="readOnly"
      spellcheck="false"
      @input="handleFallbackInput"
    />
    <div v-else ref="containerRef" class="spark-json-editor__surface"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Content, JSONEditorPropsOptional } from 'vanilla-jsoneditor'

type SparkJsonEditorMode = 'text' | 'tree' | 'table'

interface SparkJsonEditorInstance {
  updateProps: (props: JSONEditorPropsOptional) => void
  destroy: () => Promise<void>
}

interface Props {
  modelValue?: string
  readOnly?: boolean
  height?: number | string
  mode?: SparkJsonEditorMode
  indentation?: number | string
  tabSize?: number
  mainMenuBar?: boolean
  navigationBar?: boolean
  statusBar?: boolean
  askToFormat?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  readOnly: false,
  height: 360,
  mode: 'text',
  indentation: 2,
  tabSize: 2,
  mainMenuBar: true,
  navigationBar: true,
  statusBar: true,
  askToFormat: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const editorRef = shallowRef<SparkJsonEditorInstance | null>(null)
const initError = ref<string | null>(null)
const currentContent = shallowRef<Content>(toEditorContent(props.modelValue))
const lastSerializedValue = ref(props.modelValue)

const rootStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))

function toEditorContent(rawText: string): Content {
  try {
    return { json: JSON.parse(rawText) as unknown }
  } catch {
    return { text: rawText }
  }
}

function toEditorText(content: Content): string {
  if ('text' in content) return content.text
  return JSON.stringify(content.json, null, props.indentation) ?? ''
}

function buildEditorProps(): JSONEditorPropsOptional {
  return {
    content: currentContent.value,
    readOnly: props.readOnly,
    mode: props.mode as NonNullable<JSONEditorPropsOptional['mode']>,
    indentation: props.indentation,
    tabSize: props.tabSize,
    mainMenuBar: props.mainMenuBar,
    navigationBar: props.navigationBar,
    statusBar: props.statusBar,
    askToFormat: props.askToFormat,
    onChange: (updatedContent) => {
      currentContent.value = updatedContent
      const nextValue = toEditorText(updatedContent)
      lastSerializedValue.value = nextValue
      if (nextValue !== props.modelValue) {
        emit('update:modelValue', nextValue)
      }
    },
  }
}

async function mountEditor(): Promise<void> {
  if (!containerRef.value || typeof window === 'undefined') return

  if (typeof ResizeObserver === 'undefined') {
    initError.value = '当前环境缺少 ResizeObserver，JSON 编辑器未初始化，已切换为文本编辑模式。'
    return
  }

  try {
    const { createJSONEditor } = await import('vanilla-jsoneditor')
    editorRef.value = createJSONEditor({
      target: containerRef.value,
      props: buildEditorProps(),
    }) as SparkJsonEditorInstance
    initError.value = null
  } catch (error) {
    initError.value = error instanceof Error
      ? `JSON 编辑器初始化失败: ${error.message}`
      : `JSON 编辑器初始化失败: ${String(error)}`
  }
}

function handleFallbackInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement
  currentContent.value = { text: target.value }
  lastSerializedValue.value = target.value
  emit('update:modelValue', target.value)
}

watch(() => props.modelValue, (value) => {
  if (value === lastSerializedValue.value) return
  currentContent.value = toEditorContent(value)
  lastSerializedValue.value = value
  editorRef.value?.updateProps(buildEditorProps())
})

watch(
  () => [
    props.readOnly,
    props.mode,
    props.indentation,
    props.tabSize,
    props.mainMenuBar,
    props.navigationBar,
    props.statusBar,
    props.askToFormat,
  ] as const,
  () => {
    editorRef.value?.updateProps(buildEditorProps())
  },
)

onMounted(() => {
  void mountEditor()
})

onBeforeUnmount(() => {
  const editor = editorRef.value
  editorRef.value = null
  if (editor) {
    void editor.destroy()
  }
})
</script>

<style scoped>
.spark-json-editor {
  width: 100%;
  min-width: 0;
}

.spark-json-editor__notice {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-color-warning-light-7);
  border-radius: 6px;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  line-height: 1.5;
}

.spark-json-editor__surface {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.spark-json-editor__surface :deep(.jse-main) {
  height: 100%;
}

.spark-json-editor__fallback {
  display: block;
  width: 100%;
  height: calc(100% - 40px);
  min-height: 220px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  box-sizing: border-box;
  resize: vertical;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.spark-json-editor__fallback:focus {
  outline: none;
  border-color: var(--el-color-primary);
}
</style>