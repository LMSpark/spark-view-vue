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
                v-if="row.keyEditable && isEditable && isRowActive(row)"
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
              v-if="row.typeEditable && isEditable && isRowActive(row)"
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
                  v-if="isEditable && isRowActive(row) && row._schemaEnumValues.length > 0"
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
                  :readonly="!isEditable"
                  @change="handleStringChange(row, $event)"
                />
                <span v-else class="vxe-json-tree-editor__value-text">{{ row.stringValue || '(空字符串)' }}</span>
              </template>
              <el-input-number
                v-else-if="row.type === 'number' && isRowActive(row)"
                :model-value="row.numberValue ?? 0"
                size="small"
                controls-position="right"
                :disabled="!isEditable"
                @change="handleNumberChange(row, $event)"
              />
              <el-switch
                v-else-if="row.type === 'boolean' && isRowActive(row)"
                :model-value="row.booleanValue"
                :disabled="!isEditable"
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
        <vxe-column field="id" title="路径" min-width="220" />

        <!-- 列 7: 操作 -->
        <vxe-column v-if="isEditable" title="操作" width="210">
          <template #default="{ row }">
            <div class="vxe-json-tree-editor__action-cell">
              <template v-if="isRowActive(row)">
                <el-button v-if="row.type === 'object' || row.type === 'array'" size="small" link type="primary" @click="handleAddChild(row)">加子项</el-button>
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
/**
 * @skill-description JSON 树形编辑器，基于 VXE-Table 以可折叠/展开的树结构编辑 JSON 数据。
 */
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { VxeTableInstance, VxeTablePropTypes } from 'vxe-table'
import type { SparkNode } from '../internal'
import { useBasicFieldState } from '../fields/data-components/composables/useBasicFieldState'
import {
  addChildNode,
  addSiblingNode,
  buildTreeModel,
  deleteNode,
  exportJsonDocument,
  filterTreeNodes,
  formatValuePreview,
  rootOf,
  parseJsonDocument,
  renameNodeKey,
  resolveSchemaInfoForPath,
  serializeJsonDocument,
  toDisplayRows,
  updateNodeType,
  updateNodeValue,
  type JsonDocument,
  type JsonNodeType,
  type JsonObject,
  type JsonPath,
  type JsonTreePolicy,
  type JsonValue,
  type MutationResult,
  type TreeModel,
  type TreeDisplayNode,
} from './jsonTreeEditor'

// ── 内部扩展行类型（添加 schema + 搜索字段）─────────────────

interface DisplayRow extends TreeDisplayNode {
  displayKey: string
  valuePreview: string
  stringValue: string
  numberValue: number | null
  booleanValue: boolean
  _searchText: string
  _schemaTitle: string
  _schemaDescription: string
  _schemaRequired: boolean
  _schemaEnumValues: string[]
}

// ── Props ─────────────────────────────────────────────────────

interface Props extends SparkNode {
  /** 字段绑定名，映射到 DataView 行字段 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  modelValue?: string
  documentValue?: JsonDocument | null
  height?: number | string
  readOnly?: boolean
  schema?: Record<string, unknown> | null
  filterPlaceholder?: string
  // ── policy 聚合对象（复杂场景一次传入）──
  policy?: Partial<JsonTreePolicy>
  // ── policy 平铺 props（优先级高于 policy 对象）──
  rootLabel?: string
  isProtected?: (path: JsonPath) => boolean
  canEditKey?: (path: JsonPath) => boolean
  canEditType?: (path: JsonPath) => boolean
  suggestChildKey?: (target: JsonObject, parentPath: JsonPath) => string
  createDefaultArrayItem?: (parentPath: JsonPath) => JsonValue
  createDefaultObjectValue?: (parentPath: JsonPath, key: string) => JsonValue
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  documentValue: null,
  height: 420,
  readOnly: false,
  schema: null,
  filterPlaceholder: '筛选路径 / 键名 / 值',
  type: 'json-tree-editor',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:documentValue': [value: JsonDocument]
}>()

// ── 字段能力接入 ────────────────────────────────────────────

const { permission, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'json-tree-editor',
  fallbackValue: '',
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable: _fieldEditable } = permission

/** 字段模式用权限驱动；独立模式用 !readOnly */
const isEditable = computed(() =>
  props.field ? _fieldEditable.value : !props.readOnly,
)

/**
 * 字段模式下的有效输入值。
 * DATA_ROW[field] 可能是 string（JSON 文本）→ 反序列化；
 * 也可能是 object/array（已解析文档）→ 直接使用。
 */
const effectiveFieldInput = computed<string | JsonDocument>(() => {
  if (props.field) {
    const raw: unknown = fieldValue.value
    if (raw !== null && typeof raw === 'object') return raw as JsonDocument
    return typeof raw === 'string' ? raw : ''
  }
  return props.modelValue
})
// ── 合并 policy（平铺 props 优先） ──────────────────────────

const mergedPolicy = computed<Partial<JsonTreePolicy>>(() => {
  const base = props.policy ?? {}
  return {
    ...base,
    ...(props.rootLabel !== undefined ? { rootLabel: props.rootLabel } : {}),
    ...(props.isProtected !== undefined ? { isProtected: props.isProtected } : {}),
    ...(props.canEditKey !== undefined ? { canEditKey: props.canEditKey } : {}),
    ...(props.canEditType !== undefined ? { canEditType: props.canEditType } : {}),
    ...(props.suggestChildKey !== undefined ? { suggestChildKey: props.suggestChildKey } : {}),
    ...(props.createDefaultArrayItem !== undefined ? { createDefaultArrayItem: props.createDefaultArrayItem } : {}),
    ...(props.createDefaultObjectValue !== undefined ? { createDefaultObjectValue: props.createDefaultObjectValue } : {}),
  }
})

const tableRef = ref<VxeTableInstance<DisplayRow> | null>(null)
const keywordInput = ref('')
const keyword = ref('')
const typeFilter = ref<'all' | JsonNodeType>('all')
const schemaOnly = ref(false)
const parseError = ref<string | null>(null)
const treeModelRef = shallowRef<TreeModel>(buildTreeModel({}))
const currentRowId = ref(rootOf(treeModelRef.value))
let keywordTimer: ReturnType<typeof setTimeout> | undefined
let lastEmittedModelValue: string | null = null
let tableStateInitialized = false
let lastFilterActiveState = false
let pendingExpandRowId: string | null = null
let pendingRestoreState: { expandPaths: Set<string>; currentPath: string | null } | null = null

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
  const rawRows = toDisplayRows(treeModelRef.value, mergedPolicy.value)
  const schemaCache = new Map<string, ReturnType<typeof resolveSchemaInfoForPath>>()
  const rootLabel = mergedPolicy.value.rootLabel ?? '$'
  const policy = mergedPolicy.value
  for (const row of rawRows) enrichRow(row, schemaCache, rootLabel, policy)
  return rawRows as DisplayRow[]
})

const filteredRows = computed<DisplayRow[]>(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  const hasKeyword = normalizedKeyword.length > 0
  const hasFilter = schemaOnly.value || typeFilter.value !== 'all' || hasKeyword

  if (!hasFilter) return allRows.value

  return filterTreeNodes<DisplayRow>(allRows.value, (row) => {
    if (row.depth > 0 && typeFilter.value !== 'all' && row.type !== typeFilter.value) {
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

watch(effectiveFieldInput, (value) => {
  if (props.documentValue !== null) return
  if (typeof value === 'string') {
    if (lastEmittedModelValue !== null && value === lastEmittedModelValue) {
      lastEmittedModelValue = null
      return
    }
    syncDocument(value)
  } else {
    syncDocumentValue(value)
  }
}, { immediate: true })

watch(displayRows, () => {
  syncTableState()
}, { immediate: true })

onBeforeUnmount(() => {
  if (keywordTimer) clearTimeout(keywordTimer)
})

// ── 树状态捕获与恢复 ────────────────────────────────────────

function serializePath(path: JsonPath): string {
  return path.map(s => typeof s === 'number' ? `[${s}]` : s).join('/')
}

/**
 * 在模型整体重建前捕获展开/选中状态（按路径，不依赖 ID）。
 * syncTableState 会在下一 tick 检测并恢复。
 */
function captureTreeState(): void {
  const table = tableRef.value
  if (!table) return
  const expandedRecords = table.getTreeExpandRecords() as DisplayRow[]
  const expandPaths = new Set(expandedRecords.map(r => serializePath(r.path)))
  const currentRow = allRows.value.find(r => r.id === currentRowId.value)
  const currentPath = currentRow ? serializePath(currentRow.path) : null
  pendingRestoreState = { expandPaths, currentPath }
}

// ── 文档同步 ─────────────────────────────────────────────────

function syncDocument(rawText: string): void {
  if (rawText.trim() === '') {
    captureTreeState()
    treeModelRef.value = buildTreeModel({}, mergedPolicy.value)
    parseError.value = null
    return
  }
  try {
    captureTreeState()
    const doc = parseJsonDocument(rawText)
    treeModelRef.value = buildTreeModel(doc, mergedPolicy.value)
    parseError.value = null
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error)
  }
}

function syncDocumentValue(value: JsonDocument): void {
  const nextDocument = cloneDocument(value)
  const nextText = serializeJsonDocument(nextDocument)
  if (lastEmittedModelValue !== null && nextText === lastEmittedModelValue) {
    lastEmittedModelValue = null
    return
  }
  captureTreeState()
  treeModelRef.value = buildTreeModel(nextDocument, mergedPolicy.value)
  parseError.value = null
}

// ── 行增强（schema + 搜索文本）──────────────────────────────

function enrichRow(
  row: TreeDisplayNode,
  schemaCache: Map<string, ReturnType<typeof resolveSchemaInfoForPath>>,
  rootLabel: string,
  policy: Partial<JsonTreePolicy>,
): DisplayRow {
  const isContainer = row.type === 'object' || row.type === 'array'
  const displayKey = row.depth === 0 ? rootLabel
    : (typeof row.segment === 'number' ? `[${row.segment}]` : row.segment)
  const valuePreview = formatValuePreview(row.type, isContainer ? null : row.value, row.childCount)
  const stringValue = typeof row.value === 'string' ? row.value : ''
  const numberValue = typeof row.value === 'number' ? row.value : null
  const booleanValue = row.value === true

  const cacheKey = row.id
  const schemaInfo = schemaCache.get(cacheKey) ?? resolveSchemaInfoForPath(props.schema, row.path)
  schemaCache.set(cacheKey, schemaInfo)

  // Policy 提供的值选项（仅当 Schema 无 enum 时使用）
  const policyOptions = schemaInfo.enumValues.length === 0
    ? policy.getValueOptions?.(row.path)
    : undefined

  const searchText = [
    displayKey,
    row.id,
    valuePreview,
    stringValue,
    schemaInfo.title,
    schemaInfo.description,
    schemaInfo.enumValues.join(' '),
  ].join(' ').toLowerCase()

  const display = row as DisplayRow
  display.displayKey = displayKey
  display.valuePreview = valuePreview
  display.stringValue = stringValue
  display.numberValue = numberValue
  display.booleanValue = booleanValue
  display._searchText = searchText
  display._schemaTitle = schemaInfo.title
  display._schemaDescription = schemaInfo.description
  display._schemaRequired = schemaInfo.required
  // Schema enum 优先；若 Schema 无 enum，回退到 policy.getValueOptions
  display._schemaEnumValues = schemaInfo.enumValues.length > 0
    ? schemaInfo.enumValues
    : (policyOptions ?? [])
  return display
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
  mutateModel((current) => renameNodeKey(current, row.id, value, mergedPolicy.value))
}

function handleTypeChange(row: DisplayRow, value: JsonNodeType): void {
  if (value === undefined || value === null) return
  mutateModel((current) => updateNodeType(current, row.id, value, mergedPolicy.value))
}

function handleStringUpdate(row: DisplayRow, value: string | undefined): void {
  mutateModel((current) => updateNodeValue(current, row.id, value ?? ''))
}

function handleStringChange(row: DisplayRow, value: string | number): void {
  mutateModel((current) => updateNodeValue(current, row.id, String(value)))
}

function handleNumberChange(row: DisplayRow, value: string | number | null | undefined): void {
  const nextValue = typeof value === 'number' ? value : Number(value)
  mutateModel((current) => updateNodeValue(current, row.id, Number.isFinite(nextValue) ? nextValue : 0))
}

function handleBooleanChange(row: DisplayRow, value: boolean): void {
  mutateModel((current) => updateNodeValue(current, row.id, value))
}

function handleAddChild(row: DisplayRow): void {
  mutateModel((current) => addChildNode(current, row.id, mergedPolicy.value))
}

function handleAddSibling(row: DisplayRow): void {
  mutateModel((current) => addSiblingNode(current, row.id, mergedPolicy.value))
}

function handleDelete(row: DisplayRow): void {
  mutateModel((current) => deleteNode(current, row.id, mergedPolicy.value))
}

function mutateModel(mutator: (current: TreeModel) => MutationResult): void {
  if (!isEditable.value) return
  const result = mutator(treeModelRef.value)
  // uid 稳定标识，直接用作焦点/展开行，无数组索引偏移问题
  currentRowId.value = result.focusId
  pendingExpandRowId = result.expandId
  treeModelRef.value = result.model
  const nextDocument = exportJsonDocument(result.model)
  const nextText = serializeJsonDocument(nextDocument)
  parseError.value = null
  lastEmittedModelValue = nextText
  emit('update:documentValue', cloneDocument(nextDocument))
  emit('update:modelValue', nextText)
  // 字段模式：通过能力链回写 DATA_ROW[field]
  void handleControlledChange(nextText)
}

function cloneDocument(value: JsonDocument): JsonDocument {
  return JSON.parse(JSON.stringify(value)) as JsonDocument
}

// ── 类型标签 ──────────────────────────────────────────────────

function renderTypeLabel(type: JsonNodeType): string {
  switch (type) {
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

    // ── 恢复外部同步（undo/redo）前的展开 + 选中状态 ──
    if (pendingRestoreState) {
      const { expandPaths, currentPath } = pendingRestoreState
      pendingRestoreState = null
      tableStateInitialized = true

      const rowsToExpand = displayRows.value.filter(r => expandPaths.has(serializePath(r.path)))
      const activeRow = currentPath
        ? displayRows.value.find(r => serializePath(r.path) === currentPath) ?? firstRow
        : firstRow
      currentRowId.value = activeRow.id

      if (rowsToExpand.length > 0) {
        void table.clearTreeExpand().then(() => {
          return table.setTreeExpand(rowsToExpand, true)
        }).then(() => {
          table.setCurrentRow(activeRow)
        })
      } else {
        table.setCurrentRow(activeRow)
      }
      return
    }

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
