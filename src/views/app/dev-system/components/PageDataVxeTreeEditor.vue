<template>
  <div class="page-data-vxe-tree-editor" :style="rootStyle">
    <div class="page-data-vxe-tree-editor__toolbar">
      <div class="page-data-vxe-tree-editor__toolbar-main">
        <el-input
          :model-value="keywordInput"
          clearable
          placeholder="筛选路径 / 键名 / 值 / Schema 标题 / 描述"
          class="page-data-vxe-tree-editor__keyword"
          @update:model-value="handleKeywordChange"
        >
          <template #prefix>
            <span class="page-data-vxe-tree-editor__prefix">筛选</span>
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
          :model-value="schemaOnly"
          inline-prompt
          active-text="Schema"
          inactive-text="全部"
          @update:model-value="handleSchemaOnlyChange"
        />
      </div>
      <div class="page-data-vxe-tree-editor__toolbar-actions">
        <el-button size="small" @click="expandAll">展开全部</el-button>
        <el-button size="small" @click="collapseAll">收起全部</el-button>
      </div>
    </div>

    <div v-if="parseError" class="page-data-vxe-tree-editor__notice page-data-vxe-tree-editor__notice--warning">
      {{ parseError }}
    </div>

    <div v-else-if="filteredRows.length === 0" class="page-data-vxe-tree-editor__empty">
      当前过滤条件下没有匹配节点
    </div>

    <div v-else class="page-data-vxe-tree-editor__table-shell">
      <vxe-table
        ref="tableRef"
        border
        show-overflow="title"
        show-header-overflow="title"
        :data="tableRows"
        :height="tableHeight"
        :row-config="rowConfig"
        :column-config="columnConfig"
        :tree-config="treeConfig"
        :virtual-y-config="virtualYConfig"
        @current-row-change="handleCurrentRowChange"
      >
        <vxe-column field="displayKey" title="节点" min-width="240" tree-node>
          <template #default="{ row }">
            <div class="page-data-vxe-tree-editor__key-cell">
              <el-input
                v-if="row.keyEditable && !readOnly && isRowActive(row)"
                :model-value="row.displayKey"
                size="small"
                @change="handleKeyChange(row, $event)"
              />
              <span v-else class="page-data-vxe-tree-editor__key-text">{{ row.displayKey }}</span>
              <el-tag v-if="row.schemaRequired" size="small" type="danger" effect="plain">必填</el-tag>
            </div>
          </template>
        </vxe-column>

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

        <vxe-column field="valuePreview" title="值" min-width="260">
          <template #default="{ row }">
            <div class="page-data-vxe-tree-editor__value-cell">
              <template v-if="row.type === 'string'">
                <el-select
                  v-if="!readOnly && isRowActive(row) && row.schemaEnumValues.length > 0"
                  :model-value="row.stringValue"
                  size="small"
                  filterable
                  clearable
                  @update:model-value="handleStringUpdate(row, $event)"
                >
                  <el-option v-for="option in row.schemaEnumValues" :key="option" :label="option" :value="option" />
                </el-select>
                <el-input
                  v-else-if="isRowActive(row)"
                  :model-value="row.stringValue"
                  size="small"
                  :readonly="readOnly"
                  @change="handleStringChange(row, $event)"
                />
                <span v-else class="page-data-vxe-tree-editor__value-text">{{ row.stringValue || '(空字符串)' }}</span>
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
              <span v-else-if="row.type === 'number'" class="page-data-vxe-tree-editor__value-text">{{ row.valuePreview }}</span>
              <el-tag v-else-if="row.type === 'null'" size="small" type="info">null</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">{{ row.valuePreview }}</el-tag>
            </div>
          </template>
        </vxe-column>

        <vxe-column field="schemaTitle" title="Schema" min-width="190">
          <template #default="{ row }">
            <div class="page-data-vxe-tree-editor__schema-cell">
              <span>{{ row.schemaTitle || '-' }}</span>
              <el-tag v-if="row.schemaEnumValues.length > 0" size="small" type="success" effect="plain">
                枚举 {{ row.schemaEnumValues.length }}
              </el-tag>
            </div>
          </template>
        </vxe-column>

        <vxe-column field="schemaDescription" title="说明" min-width="320">
          <template #default="{ row }">
            <div class="page-data-vxe-tree-editor__description-cell">
              <span>{{ row.schemaDescription || row.valuePreview }}</span>
            </div>
          </template>
        </vxe-column>

        <vxe-column field="pathText" title="路径" min-width="220" />

        <vxe-column v-if="!readOnly" title="操作" width="210">
          <template #default="{ row }">
            <div class="page-data-vxe-tree-editor__action-cell">
              <template v-if="isRowActive(row)">
                <el-button size="small" link type="primary" @click="handleAddChild(row)">加子项</el-button>
                <el-button size="small" link type="primary" @click="handleAddSibling(row)">加同级</el-button>
                <el-button v-if="row.deletable" size="small" link type="danger" @click="handleDelete(row)">删除</el-button>
              </template>
              <span v-else class="page-data-vxe-tree-editor__action-hint">选中行后可编辑</span>
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
  buildPageDataTreeRows,
  deleteNode,
  filterPageDataTreeRows,
  formatPageDataPath,
  parsePageDataDocument,
  renameNodeKey,
  resolveSchemaInfoForPath,
  serializePageDataDocument,
  updateNodeBooleanValue,
  updateNodeNumberValue,
  updateNodeStringValue,
  updateNodeType,
  type JsonObject,
  type PageDataPath,
  type PageDataNodeType,
  type PageDataTreeRow,
} from '../pageDataTreeEditor'

type EnrichedPageDataTreeRow = Omit<PageDataTreeRow, 'children'> & {
  searchText: string
  schemaTitle: string
  schemaDescription: string
  schemaRequired: boolean
  schemaEnumValues: string[]
  children?: EnrichedPageDataTreeRow[] | undefined
}

type TablePageDataTreeRow = Omit<EnrichedPageDataTreeRow, 'children'> & {
  parentId: string | null
  _children?: TablePageDataTreeRow[] | undefined
}

interface Props {
  modelValue?: string
  documentValue?: Record<string, unknown> | null
  height?: number | string
  readOnly?: boolean
  schema?: Record<string, unknown> | null
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  documentValue: null,
  height: 420,
  readOnly: false,
  schema: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:documentValue': [value: Record<string, unknown>]
}>()

const tableRef = ref<VxeTableInstance<TablePageDataTreeRow> | null>(null)
const keywordInput = ref('')
const keyword = ref('')
const typeFilter = ref<'all' | Exclude<PageDataNodeType, 'root'>>('all')
const schemaOnly = ref(false)
const parseError = ref<string | null>(null)
const documentRef = ref<JsonObject>({})
const currentRowId = ref('$')
let keywordTimer: ReturnType<typeof setTimeout> | undefined
let lastEmittedModelValue: string | null = null
let tableStateInitialized = false
let lastFilterActiveState = false
let pendingExpandRowId: string | null = null

const nodeTypeOptions = [
  { label: '对象', value: 'object' },
  { label: '数组', value: 'array' },
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
  { label: '空值', value: 'null' },
] as const

const editableTypeOptions = nodeTypeOptions

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

const allRows = computed<EnrichedPageDataTreeRow[]>(() => {
  const schemaCache = new Map<string, ReturnType<typeof resolveSchemaInfoForPath>>()
  return buildPageDataTreeRows(documentRef.value).map((row) => enrichRow(row, schemaCache))
})

const filteredRows = computed<EnrichedPageDataTreeRow[]>(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()

  if (!schemaOnly.value && typeFilter.value === 'all' && normalizedKeyword.length === 0) {
    return allRows.value
  }

  return filterPageDataTreeRows(allRows.value, (row) => {
    if (row.type !== 'root' && typeFilter.value !== 'all' && row.type !== typeFilter.value) {
      return false
    }
    if (schemaOnly.value && row.schemaTitle === '' && row.schemaDescription === '') {
      return false
    }
    if (normalizedKeyword.length === 0) {
      return true
    }

    return row.searchText.includes(normalizedKeyword)
  })
})

const tableRows = computed<TablePageDataTreeRow[]>(() => {
  return flattenTableRows(filteredRows.value)
})

watch(() => props.documentValue, (value) => {
  if (value === null) {
    return
  }

  syncDocumentValue(value)
}, { immediate: true })

watch(() => props.modelValue, (value) => {
  if (props.documentValue !== null) {
    return
  }

  if (lastEmittedModelValue !== null && value === lastEmittedModelValue) {
    lastEmittedModelValue = null
    return
  }

  syncDocument(value)
}, { immediate: true })

watch(tableRows, () => {
  syncTableState()
}, { immediate: true })

onBeforeUnmount(() => {
  if (keywordTimer) {
    clearTimeout(keywordTimer)
  }
})

function syncDocument(rawText: string): void {
  if (rawText.trim() === '') {
    documentRef.value = {}
    parseError.value = null
    return
  }

  try {
    documentRef.value = parsePageDataDocument(rawText)
    parseError.value = null
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error)
  }
}

function syncDocumentValue(value: Record<string, unknown>): void {
  const nextDocument = cloneDocument(value)
  const nextText = serializePageDataDocument(nextDocument)
  if (lastEmittedModelValue !== null && nextText === lastEmittedModelValue) {
    lastEmittedModelValue = null
    return
  }

  documentRef.value = nextDocument
  parseError.value = null
}

function enrichRow(
  row: PageDataTreeRow,
  schemaCache: Map<string, ReturnType<typeof resolveSchemaInfoForPath>>,
): EnrichedPageDataTreeRow {
  const cacheKey = row.pathText
  const schemaInfo = schemaCache.get(cacheKey) ?? resolveSchemaInfoForPath(props.schema ?? null, row.path)
  schemaCache.set(cacheKey, schemaInfo)
  const nextChildren = row.children?.map((child) => enrichRow(child, schemaCache))
  const { children: _children, ...rest } = row
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
    ...rest,
    searchText,
    schemaTitle: schemaInfo.title,
    schemaDescription: schemaInfo.description,
    schemaRequired: schemaInfo.required,
    schemaEnumValues: schemaInfo.enumValues,
    ...(nextChildren ? { children: nextChildren } : {}),
  }
}

function handleKeywordChange(value: string | undefined): void {
  keywordInput.value = value ?? ''
  if (keywordTimer) {
    clearTimeout(keywordTimer)
  }
  if (keywordInput.value.trim().length === 0) {
    keyword.value = ''
    return
  }
  keywordTimer = setTimeout(() => {
    keyword.value = keywordInput.value
  }, 120)
}

function handleTypeFilterChange(value: 'all' | Exclude<PageDataNodeType, 'root'>): void {
  typeFilter.value = value
}

function handleSchemaOnlyChange(value: boolean): void {
  schemaOnly.value = value
}

function handleCurrentRowChange(params: { newValue?: TablePageDataTreeRow | null }): void {
  if (params.newValue) {
    currentRowId.value = params.newValue.id
  }
}

function isRowActive(row: Pick<TablePageDataTreeRow, 'id'>): boolean {
  return row.id === currentRowId.value
}

function handleKeyChange(row: EnrichedPageDataTreeRow, value: string | number): void {
  if (typeof value !== 'string') return
  pendingExpandRowId = resolveParentRowId(row.path)
  mutateDocument((current) => renameNodeKey(current, row.path, value))
}

function handleTypeChange(row: EnrichedPageDataTreeRow, value: Exclude<PageDataNodeType, 'root'>): void {
  if (value === undefined || value === null) return
  mutateDocument((current) => updateNodeType(current, row.path, value))
}

function handleStringUpdate(row: EnrichedPageDataTreeRow, value: string | undefined): void {
  mutateDocument((current) => updateNodeStringValue(current, row.path, value ?? ''))
}

function handleStringChange(row: EnrichedPageDataTreeRow, value: string | number): void {
  mutateDocument((current) => updateNodeStringValue(current, row.path, String(value)))
}

function handleNumberChange(row: EnrichedPageDataTreeRow, value: string | number | null | undefined): void {
  const nextValue = typeof value === 'number' ? value : Number(value)
  mutateDocument((current) => updateNodeNumberValue(current, row.path, Number.isFinite(nextValue) ? nextValue : 0))
}

function handleBooleanChange(row: EnrichedPageDataTreeRow, value: boolean): void {
  mutateDocument((current) => updateNodeBooleanValue(current, row.path, value))
}

function handleAddChild(row: EnrichedPageDataTreeRow): void {
  pendingExpandRowId = row.id
  mutateDocument((current) => addChildNode(current, row.path))
}

function handleAddSibling(row: EnrichedPageDataTreeRow): void {
  pendingExpandRowId = resolveParentRowId(row.path)
  mutateDocument((current) => addSiblingNode(current, row.path))
}

function handleDelete(row: EnrichedPageDataTreeRow): void {
  const parentRowId = resolveParentRowId(row.path)
  pendingExpandRowId = parentRowId
  currentRowId.value = parentRowId
  mutateDocument((current) => deleteNode(current, row.path))
}

function mutateDocument(mutator: (current: JsonObject) => JsonObject): void {
  if (props.readOnly) return

  const nextDocument = mutator(documentRef.value)
  const nextText = serializePageDataDocument(nextDocument)
  documentRef.value = nextDocument
  parseError.value = null
  lastEmittedModelValue = nextText
  emit('update:documentValue', cloneDocument(nextDocument))
  emit('update:modelValue', nextText)
}

function cloneDocument(value: Record<string, unknown>): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject
}

function renderTypeLabel(type: PageDataNodeType): string {
  switch (type) {
    case 'root':
      return '根节点'
    case 'object':
      return '对象'
    case 'array':
      return '数组'
    case 'number':
      return '数字'
    case 'boolean':
      return '布尔'
    case 'null':
      return '空值'
    default:
      return '字符串'
  }
}

function syncTableState(): void {
  void nextTick(() => {
    const table = tableRef.value
    const rootRow = tableRows.value[0]
    if (!table || !rootRow) {
      return
    }

    const activeRow = tableRows.value.find((row) => row.id === currentRowId.value) ?? rootRow
    currentRowId.value = activeRow.id

    const filterActive = hasActiveFilter.value
    const shouldExpandAllForFilter = filterActive && (!tableStateInitialized || !lastFilterActiveState)
    const shouldInitRoot = !tableStateInitialized && !filterActive
    const pendingExpandRow = pendingExpandRowId
      ? tableRows.value.find((row) => row.id === pendingExpandRowId) ?? null
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
      void table.setTreeExpand(rootRow, true).then(() => {
        table.setCurrentRow(activeRow)
      })
      return
    }

    table.setCurrentRow(activeRow)
  })
}

function resolveParentRowId(path: PageDataPath): string {
  if (path.length <= 1) {
    return '$'
  }
  return formatPageDataPath(path.slice(0, -1))
}

function flattenTableRows(
  rows: EnrichedPageDataTreeRow[],
  parentId: string | null = null,
): TablePageDataTreeRow[] {
  return rows.flatMap((row) => {
    const { children: _children, ...rest } = row
    const nextRow: TablePageDataTreeRow = {
      ...rest,
      parentId,
    }
    const childRows = row.children ? flattenTableRows(row.children, row.id) : []
    return [nextRow, ...childRows]
  })
}

function expandAll(): void {
  if (filteredRows.value.length === 0) {
    return
  }

  void nextTick(() => {
    tableRef.value?.setAllTreeExpand(true)
  })
}

function collapseAll(): void {
  if (filteredRows.value.length === 0) {
    return
  }

  void nextTick(() => {
    tableRef.value?.clearTreeExpand()
  })
}
</script>

<style scoped>
.page-data-vxe-tree-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

.page-data-vxe-tree-editor__table-shell {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.page-data-vxe-tree-editor__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.page-data-vxe-tree-editor__toolbar-main,
.page-data-vxe-tree-editor__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-data-vxe-tree-editor__keyword {
  width: 360px;
}

.page-data-vxe-tree-editor__prefix {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.page-data-vxe-tree-editor__notice,
.page-data-vxe-tree-editor__empty {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
}

.page-data-vxe-tree-editor__notice {
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.page-data-vxe-tree-editor__notice--warning {
  border-color: var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
}

.page-data-vxe-tree-editor__empty {
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
}

.page-data-vxe-tree-editor__key-cell,
.page-data-vxe-tree-editor__schema-cell,
.page-data-vxe-tree-editor__action-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.page-data-vxe-tree-editor__key-cell,
.page-data-vxe-tree-editor__value-cell,
.page-data-vxe-tree-editor__description-cell {
  min-height: 28px;
}

.page-data-vxe-tree-editor__value-text,
.page-data-vxe-tree-editor__action-hint {
  color: var(--el-text-color-secondary);
}

.page-data-vxe-tree-editor__key-text {
  font-weight: 500;
}

.page-data-vxe-tree-editor__description-cell {
  color: var(--el-text-color-regular);
  line-height: 1.5;
}

.page-data-vxe-tree-editor__action-cell {
  justify-content: flex-end;
}

@media (max-width: 960px) {
  .page-data-vxe-tree-editor__keyword {
    width: 100%;
  }

  .page-data-vxe-tree-editor__toolbar {
    align-items: stretch;
  }

  .page-data-vxe-tree-editor__toolbar-main,
  .page-data-vxe-tree-editor__toolbar-actions {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
