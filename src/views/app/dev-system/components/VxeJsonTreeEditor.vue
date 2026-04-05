<template>
  <div class="vxe-json-tree-editor" :style="rootStyle">
    <div class="vxe-json-tree-editor__toolbar">
      <div class="vxe-json-tree-editor__toolbar-main">
        <el-input
          :model-value="keywordInput"
          clearable
          :placeholder="filterPlaceholder"
          class="vxe-json-tree-editor__keyword"
          @update:model-value="handleKeywordChange"
        >
          <template #prefix>
            <span class="vxe-json-tree-editor__prefix">筛选</span>
          </template>
        </el-input>
        <el-select
          :model-value="typeFilter"
          size="small"
          style="width: 140px"
          @update:model-value="handleTypeFilterChange"
        >
          <el-option label="全部类型" value="all" />
          <el-option v-for="option in nodeTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-switch
          v-if="schema"
          :model-value="schemaOnly"
          inline-prompt
          active-text="Schema"
          inactive-text="全部"
          @update:model-value="handleSchemaOnlyChange"
        />
      </div>
      <div class="vxe-json-tree-editor__toolbar-actions">
        <el-button size="small" @click="expandAll">展开全部</el-button>
        <el-button size="small" @click="collapseAll">收起全部</el-button>
      </div>
    </div>

    <div v-if="parseError" class="vxe-json-tree-editor__notice vxe-json-tree-editor__notice--warning">
      {{ parseError }}
    </div>

    <div v-else-if="displayRows.length === 0" class="vxe-json-tree-editor__empty">
      当前过滤条件下没有匹配节点
    </div>

    <div v-else class="vxe-json-tree-editor__table-shell">
      <vxe-table
        ref="tableRef"
        border
        show-overflow="title"
        show-header-overflow="title"
        :data="displayRows"
        :height="tableHeight"
        :row-config="rowConfig"
        :column-config="columnConfig"
        :tree-config="treeConfig"
        :virtual-y-config="virtualYConfig"
        @current-row-change="handleCurrentRowChange"
      >
        <!-- 列 1: 节点键名（tree-node） -->
        <vxe-column field="displayKey" title="节点" min-width="240" tree-node>
          <template #default="{ row }">
            <div class="vxe-json-tree-editor__key-cell">
              <el-input
                v-if="row.keyEditable && !readOnly && isRowActive(row)"
                :model-value="row.displayKey"
                size="small"
                @change="handleKeyChange(row, $event)"
              />
              <span v-else class="vxe-json-tree-editor__key-text">{{ row.displayKey }}</span>
              <el-tag v-if="row._schemaRequired" size="small" type="danger" effect="plain">必填</el-tag>
            </div>
          </template>
        </vxe-column>

        <!-- 列 2: 类型 -->
        <vxe-column field="type" title="类型" width="130">
          <template #default="{ row }">
            <el-select
              v-if="row.typeEditable && !readOnly && isRowActive(row)"
              :model-value="row.type"
              size="small"
              style="width: 110px"
              @update:model-value="handleTypeChange(row, $event)"
            >
              <el-option v-for="option in editableTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
            <el-tag v-else size="small" effect="plain">{{ renderTypeLabel(row.type) }}</el-tag>
          </template>
        </vxe-column>

        <!-- 列 3: 值（按类型自适应编辑控件） -->
        <vxe-column field="valuePreview" title="值" min-width="260">
          <template #default="{ row }">
            <div class="vxe-json-tree-editor__value-cell">
              <template v-if="row.type === 'string'">
                <el-select
                  v-if="!readOnly && isRowActive(row) && row._schemaEnumValues.length > 0"
                  :model-value="row.stringValue"
                  size="small"
                  filterable
                  clearable
                  @update:model-value="handleStringUpdate(row, $event)"
                >
                  <el-option v-for="option in row._schemaEnumValues" :key="option" :label="option" :value="option" />
                </el-select>
                <el-input
                  v-else-if="isRowActive(row)"
                  :model-value="row.stringValue"
                  size="small"
                  :readonly="readOnly"
                  @change="handleStringChange(row, $event)"
                />
                <span v-else class="vxe-json-tree-editor__value-text">{{ row.stringValue || '(空字符串)' }}</span>
              </template>
              <el-input-number
                v-else-if="row.type === 'number' && isRowActive(row)"
                :model-value="row.numberValue ?? 0"
                size="small"
                controls-position="right"
                :disabled="readOnly"
                @change="handleNumberChange(row, $event)"
              />
              <el-switch
                v-else-if="row.type === 'boolean' && isRowActive(row)"
                :model-value="row.booleanValue"
                :disabled="readOnly"
                @update:model-value="handleBooleanChange(row, $event)"
              />
              <el-tag v-else-if="row.type === 'boolean'" size="small" type="info" effect="plain">
                {{ row.booleanValue ? 'true' : 'false' }}
              </el-tag>
              <span v-else-if="row.type === 'number'" class="vxe-json-tree-editor__value-text">{{ row.valuePreview }}</span>
              <el-tag v-else-if="row.type === 'null'" size="small" type="info">null</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">{{ row.valuePreview }}</el-tag>
            </div>
          </template>
        </vxe-column>

        <!-- 列 4: Schema 标题（条件展示） -->
        <vxe-column v-if="schema" field="_schemaTitle" title="Schema" min-width="190">
          <template #default="{ row }">
            <div class="vxe-json-tree-editor__schema-cell">
              <span>{{ row._schemaTitle || '-' }}</span>
              <el-tag v-if="row._schemaEnumValues.length > 0" size="small" type="success" effect="plain">
                枚举 {{ row._schemaEnumValues.length }}
              </el-tag>
            </div>
          </template>
        </vxe-column>

        <!-- 列 5: 说明（条件展示） -->
        <vxe-column v-if="schema" field="_schemaDescription" title="说明" min-width="320">
          <template #default="{ row }">
            <span>{{ row._schemaDescription || row.valuePreview }}</span>
          </template>
        </vxe-column>

        <!-- 列 6: 路径 -->
        <vxe-column field="pathText" title="路径" min-width="220" />

        <!-- 列 7: 操作 -->
        <vxe-column v-if="!readOnly" title="操作" width="210">
          <template #default="{ row }">
            <div class="vxe-json-tree-editor__action-cell">
              <template v-if="isRowActive(row)">
                <el-button v-if="row.isContainer" size="small" link type="primary" @click="handleAddChild(row)">加子项</el-button>
                <el-button v-if="row.depth > 0" size="small" link type="primary" @click="handleAddSibling(row)">加同级</el-button>
                <el-button v-if="row.deletable" size="small" link type="danger" @click="handleDelete(row)">删除</el-button>
              </template>
              <span v-else class="vxe-json-tree-editor__action-hint">选中行后可编辑</span>
            </div>
          </template>
        </vxe-column>
      </vxe-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { VxeTableInstance, VxeTablePropTypes } from 'vxe-table'
import {
  addChildNode,
  addSiblingNode,
  buildJsonTreeRows,
  deleteNode,
  filterJsonTreeRows,
  parseJsonDocument,
  renameNodeKey,
  resolveSchemaInfoForPath,
  serializeJsonDocument,
  updateNodeBooleanValue,
  updateNodeNumberValue,
  updateNodeStringValue,
  updateNodeType,
  type JsonNodeType,
  type JsonObject,
  type JsonTreePolicy,
  type JsonTreeRow,
} from '../jsonTreeEditor'

// ── 内部扩展行类型（添加 schema + 搜索字段）─────────────────

interface DisplayRow extends JsonTreeRow {
  _searchText: string
  _schemaTitle: string
  _schemaDescription: string
  _schemaRequired: boolean
  _schemaEnumValues: string[]
}

// ── Props ─────────────────────────────────────────────────────

interface Props {
  modelValue?: string
  documentValue?: Record<string, unknown> | null
  height?: number | string
  readOnly?: boolean
  schema?: Record<string, unknown> | null
  policy?: Partial<JsonTreePolicy>
  filterPlaceholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  documentValue: null,
  height: 420,
  readOnly: false,
  schema: null,
  policy: () => ({}),
  filterPlaceholder: '筛选路径 / 键名 / 值',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:documentValue': [value: Record<string, unknown>]
}>()

// ── 内部状态 ──────────────────────────────────────────────────

const tableRef = ref<VxeTableInstance<DisplayRow> | null>(null)
const keywordInput = ref('')
const keyword = ref('')
const typeFilter = ref<'all' | JsonNodeType>('all')
const schemaOnly = ref(false)
const parseError = ref<string | null>(null)
const documentRef = ref<JsonObject>({})
const currentRowId = ref('$')
let keywordTimer: ReturnType<typeof setTimeout> | undefined
let lastEmittedModelValue: string | null = null
let tableStateInitialized = false
let lastFilterActiveState = false
let pendingExpandRowId: string | null = null

// ── 常量 ──────────────────────────────────────────────────────

const nodeTypeOptions = [
  { label: '对象', value: 'object' },
  { label: '数组', value: 'array' },
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
  { label: '空值', value: 'null' },
] as const

const editableTypeOptions = nodeTypeOptions

// ── VXE 配置 ─────────────────────────────────────────────────

const rowConfig = computed<VxeTablePropTypes.RowConfig>(() => ({
  keyField: 'id',
  useKey: true,
  isCurrent: true,
}))

const columnConfig = computed<VxeTablePropTypes.ColumnConfig>(() => ({
  useKey: true,
  resizable: true,
}))

const treeConfig = computed<VxeTablePropTypes.TreeConfig>(() => ({
  transform: true,
  reserve: true,
  rowField: 'id',
  parentField: 'parentId',
  childrenField: 'children',
  mapChildrenField: '_children',
  showLine: true,
}))

const virtualYConfig = computed<VxeTablePropTypes.VirtualYConfig>(() => ({
  enabled: true,
  gt: 80,
  oSize: 20,
}))

const rootStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))

const tableHeight = computed(() => '100%')

const hasActiveFilter = computed(() => {
  return schemaOnly.value || typeFilter.value !== 'all' || keyword.value.trim().length > 0
})

// ── 数据管线 ─────────────────────────────────────────────────

const allRows = computed<DisplayRow[]>(() => {
  const rawRows = buildJsonTreeRows(documentRef.value, props.policy)
  const schemaCache = new Map<string, ReturnType<typeof resolveSchemaInfoForPath>>()
  return rawRows.map((row) => enrichRow(row, schemaCache))
})

const filteredRows = computed<DisplayRow[]>(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  const hasKeyword = normalizedKeyword.length > 0
  const hasFilter = schemaOnly.value || typeFilter.value !== 'all' || hasKeyword

  if (!hasFilter) return allRows.value

  return filterJsonTreeRows<DisplayRow>(allRows.value, (row) => {
    if (row.type !== 'root' && typeFilter.value !== 'all' && row.type !== typeFilter.value) {
      return false
    }
    if (schemaOnly.value && row._schemaTitle === '' && row._schemaDescription === '') {
      return false
    }
    if (!hasKeyword) return true
    return row._searchText.includes(normalizedKeyword)
  })
})

const displayRows = computed(() => filteredRows.value)

// ── 外部同步 ─────────────────────────────────────────────────

watch(() => props.documentValue, (value) => {
  if (value === null) return
  syncDocumentValue(value)
}, { immediate: true })

watch(() => props.modelValue, (value) => {
  if (props.documentValue !== null) return
  if (lastEmittedModelValue !== null && value === lastEmittedModelValue) {
    lastEmittedModelValue = null
    return
  }
  syncDocument(value)
}, { immediate: true })

watch(displayRows, () => {
  syncTableState()
}, { immediate: true })

onBeforeUnmount(() => {
  if (keywordTimer) clearTimeout(keywordTimer)
})

// ── 文档同步 ─────────────────────────────────────────────────

function syncDocument(rawText: string): void {
  if (rawText.trim() === '') {
    documentRef.value = {}
    parseError.value = null
    return
  }
  try {
    documentRef.value = parseJsonDocument(rawText)
    parseError.value = null
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error)
  }
}

function syncDocumentValue(value: Record<string, unknown>): void {
  const nextDocument = cloneDocument(value)
  const nextText = serializeJsonDocument(nextDocument)
  if (lastEmittedModelValue !== null && nextText === lastEmittedModelValue) {
    lastEmittedModelValue = null
    return
  }
  documentRef.value = nextDocument
  parseError.value = null
}

// ── 行增强（schema + 搜索文本）──────────────────────────────

function enrichRow(
  row: JsonTreeRow,
  schemaCache: Map<string, ReturnType<typeof resolveSchemaInfoForPath>>,
): DisplayRow {
  const cacheKey = row.pathText
  const schemaInfo = schemaCache.get(cacheKey) ?? resolveSchemaInfoForPath(props.schema, row.path)
  schemaCache.set(cacheKey, schemaInfo)

  const searchText = [
    row.displayKey,
    row.pathText,
    row.valuePreview,
    row.stringValue,
    schemaInfo.title,
    schemaInfo.description,
    schemaInfo.enumValues.join(' '),
  ].join(' ').toLowerCase()

  return {
    ...row,
    _searchText: searchText,
    _schemaTitle: schemaInfo.title,
    _schemaDescription: schemaInfo.description,
    _schemaRequired: schemaInfo.required,
    _schemaEnumValues: schemaInfo.enumValues,
  }
}

// ── 工具栏交互 ──────────────────────────────────────────────

function handleKeywordChange(value: string | undefined): void {
  keywordInput.value = value ?? ''
  if (keywordTimer) clearTimeout(keywordTimer)
  if (keywordInput.value.trim().length === 0) {
    keyword.value = ''
    return
  }
  keywordTimer = setTimeout(() => {
    keyword.value = keywordInput.value
  }, 120)
}

function handleTypeFilterChange(value: 'all' | JsonNodeType): void {
  typeFilter.value = value
}

function handleSchemaOnlyChange(value: boolean): void {
  schemaOnly.value = value
}

// ── 表格行交互 ──────────────────────────────────────────────

function handleCurrentRowChange(params: { newValue?: DisplayRow | null }): void {
  if (params.newValue) {
    currentRowId.value = params.newValue.id
  }
}

function isRowActive(row: Pick<DisplayRow, 'id'>): boolean {
  return row.id === currentRowId.value
}

// ── 编辑操作 ──────────────────────────────────────────────────

function handleKeyChange(row: DisplayRow, value: string | number): void {
  if (typeof value !== 'string') return
  pendingExpandRowId = row.parentId
  mutateDocument((current) => renameNodeKey(current, row.path, value, props.policy))
}

function handleTypeChange(row: DisplayRow, value: JsonNodeType): void {
  if (value === undefined || value === null) return
  mutateDocument((current) => updateNodeType(current, row.path, value, props.policy))
}

function handleStringUpdate(row: DisplayRow, value: string | undefined): void {
  mutateDocument((current) => updateNodeStringValue(current, row.path, value ?? ''))
}

function handleStringChange(row: DisplayRow, value: string | number): void {
  mutateDocument((current) => updateNodeStringValue(current, row.path, String(value)))
}

function handleNumberChange(row: DisplayRow, value: string | number | null | undefined): void {
  const nextValue = typeof value === 'number' ? value : Number(value)
  mutateDocument((current) => updateNodeNumberValue(current, row.path, Number.isFinite(nextValue) ? nextValue : 0))
}

function handleBooleanChange(row: DisplayRow, value: boolean): void {
  mutateDocument((current) => updateNodeBooleanValue(current, row.path, value))
}

function handleAddChild(row: DisplayRow): void {
  pendingExpandRowId = row.id
  mutateDocument((current) => addChildNode(current, row.path, props.policy))
}

function handleAddSibling(row: DisplayRow): void {
  pendingExpandRowId = row.parentId
  mutateDocument((current) => addSiblingNode(current, row.path, props.policy))
}

function handleDelete(row: DisplayRow): void {
  pendingExpandRowId = row.parentId
  currentRowId.value = row.parentId ?? '$'
  mutateDocument((current) => deleteNode(current, row.path, props.policy))
}

function mutateDocument(mutator: (current: JsonObject) => JsonObject): void {
  if (props.readOnly) return
  const nextDocument = mutator(documentRef.value)
  const nextText = serializeJsonDocument(nextDocument)
  documentRef.value = nextDocument
  parseError.value = null
  lastEmittedModelValue = nextText
  emit('update:documentValue', cloneDocument(nextDocument))
  emit('update:modelValue', nextText)
}

function cloneDocument(value: Record<string, unknown>): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject
}

// ── 类型标签 ──────────────────────────────────────────────────

function renderTypeLabel(type: JsonNodeType | 'root'): string {
  switch (type) {
    case 'root': return '根节点'
    case 'object': return '对象'
    case 'array': return '数组'
    case 'number': return '数字'
    case 'boolean': return '布尔'
    case 'null': return '空值'
    default: return '字符串'
  }
}

// ── 表格状态同步 ──────────────────────────────────────────────

function syncTableState(): void {
  void nextTick(() => {
    const table = tableRef.value
    const firstRow = displayRows.value[0]
    if (!table || !firstRow) return

    const activeRow = displayRows.value.find((row) => row.id === currentRowId.value) ?? firstRow
    currentRowId.value = activeRow.id

    const filterActive = hasActiveFilter.value
    const shouldExpandAllForFilter = filterActive && (!tableStateInitialized || !lastFilterActiveState)
    const shouldInitRoot = !tableStateInitialized && !filterActive
    const pendingExpandRow = pendingExpandRowId
      ? displayRows.value.find((row) => row.id === pendingExpandRowId) ?? null
      : null

    tableStateInitialized = true
    lastFilterActiveState = filterActive

    if (shouldExpandAllForFilter) {
      pendingExpandRowId = null
      void table.setAllTreeExpand(true).then(() => {
        table.setCurrentRow(activeRow)
      })
      return
    }

    if (pendingExpandRow) {
      pendingExpandRowId = null
      void table.setTreeExpand(pendingExpandRow, true).then(() => {
        table.setCurrentRow(activeRow)
      })
      return
    }

    if (shouldInitRoot) {
      void table.setTreeExpand(firstRow, true).then(() => {
        table.setCurrentRow(activeRow)
      })
      return
    }

    table.setCurrentRow(activeRow)
  })
}

function expandAll(): void {
  if (displayRows.value.length === 0) return
  void nextTick(() => {
    tableRef.value?.setAllTreeExpand(true)
  })
}

function collapseAll(): void {
  if (displayRows.value.length === 0) return
  void nextTick(() => {
    tableRef.value?.clearTreeExpand()
  })
}
</script>

<style scoped>
.vxe-json-tree-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

.vxe-json-tree-editor__table-shell {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.vxe-json-tree-editor__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.vxe-json-tree-editor__toolbar-main,
.vxe-json-tree-editor__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vxe-json-tree-editor__keyword {
  width: 360px;
}

.vxe-json-tree-editor__prefix {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.vxe-json-tree-editor__notice,
.vxe-json-tree-editor__empty {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
}

.vxe-json-tree-editor__notice {
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.vxe-json-tree-editor__notice--warning {
  border-color: var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
}

.vxe-json-tree-editor__empty {
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
}

.vxe-json-tree-editor__key-cell,
.vxe-json-tree-editor__schema-cell,
.vxe-json-tree-editor__action-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vxe-json-tree-editor__key-cell,
.vxe-json-tree-editor__value-cell {
  min-height: 28px;
}

.vxe-json-tree-editor__key-text,
.vxe-json-tree-editor__value-text,
.vxe-json-tree-editor__action-hint {
  color: var(--el-text-color-secondary);
}
</style>
