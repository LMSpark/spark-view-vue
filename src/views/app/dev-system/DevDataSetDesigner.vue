<!-- 
  DevDataSetDesigner — DataSet 可视化设计器
  
  功能：
  - 可视化展示表结构和关联关系
  - AI 辅助设计数据模型
  - 蓝图执行进度展示
  - 导出为 pagedata.json
-->
<template>
  <div class="dataset-designer">
    <!-- 头部操作栏 -->
    <div class="ds-header">
      <div class="ds-header__left">
        <NavIcon name="Coin" :size="18" />
        <span class="ds-title">DataSet 可视化设计器</span>
        <el-tag v-if="hasChanges" type="warning" size="small" effect="plain">未保存</el-tag>
      </div>
      <div class="ds-header__actions">
        <el-button size="small" @click="parseFromPageData(false)" :disabled="!state.activePageId.value">
          <NavIcon name="Download" :size="14" /> 从 pagedata.json 加载
        </el-button>
        <el-button size="small" type="primary" @click="exportToPageData" :disabled="tables.length === 0">
          <NavIcon name="Upload" :size="14" /> 导出到 pagedata.json
        </el-button>
      </div>
    </div>

    <!-- 主体双栏 -->
    <div class="ds-body">
      <!-- 左侧：画布区域 -->
      <div class="ds-canvas">
        <div class="ds-toolbar">
          <el-button size="small" @click="addTable">
            <NavIcon name="Plus" :size="12" /> 添加表
          </el-button>
          <el-button size="small" @click="addRelation" :disabled="tables.length < 2">
            <NavIcon name="Share" :size="12" /> 添加关联
          </el-button>
          <el-button size="small" @click="autoLayout" :disabled="tables.length === 0">
            <NavIcon name="Rank" :size="12" /> 自动布局
          </el-button>
          <el-button size="small" @click="clearAll" :disabled="tables.length === 0">
            <NavIcon name="Delete" :size="12" /> 清空
          </el-button>
          <div class="ds-toolbar__sep" />
          <el-button size="small" :disabled="!canUndo" @click="undo" title="撤销 (Ctrl+Z)">
            <NavIcon name="RefreshLeft" :size="12" /> 撤销
          </el-button>
          <el-button size="small" :disabled="!canRedo" @click="redo" title="重做 (Ctrl+Y)">
            <NavIcon name="RefreshRight" :size="12" /> 重做
          </el-button>
          <span v-if="tables.length" class="ds-toolbar__info">{{ tables.length }} 个表 · {{ relations.length }} 个关联</span>
        </div>

        <!-- 画布视口 -->
        <div class="ds-viewport">
          <div class="ds-canvas-inner" :style="canvasInnerStyle">
            <!-- SVG 关系连线层 -->
            <svg class="ds-svg-layer" :width="canvasSize.width" :height="canvasSize.height">
              <defs>
                <marker id="ds-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                  <path d="M 0 0 L 10 4 L 0 8 Z" fill="#a855f7" />
                </marker>
                <marker id="ds-arrow-hover" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                  <path d="M 0 0 L 10 4 L 0 8 Z" fill="#7c3aed" />
                </marker>
              </defs>
              <g v-for="(line, idx) in relationLines" :key="'rel-' + idx">
                <path
                  :d="line.path"
                  class="ds-rel-line"
                  :class="{ 'ds-rel-line--hover': hoveredRelIdx === idx }"
                  fill="none"
                  stroke="#c4b5fd"
                  stroke-width="2"
                  :marker-end="hoveredRelIdx === idx ? 'url(#ds-arrow-hover)' : 'url(#ds-arrow)'"
                  @mouseenter="hoveredRelIdx = idx"
                  @mouseleave="hoveredRelIdx = -1"
                  style="pointer-events: stroke;"
                />
                <!-- 关系标签（点击编辑，右键删除） -->
                <rect
                  :x="line.midX - line.labelW / 2 - 6"
                  :y="line.midY - 10"
                  :width="line.labelW + 12"
                  height="20"
                  rx="4"
                  :fill="hoveredRelIdx === idx ? '#ede9fe' : '#faf5ff'"
                  :stroke="hoveredRelIdx === idx ? '#c4b5fd' : '#e9d5ff'"
                  stroke-width="1"
                  class="ds-rel-label-bg"
                  @mouseenter="hoveredRelIdx = idx"
                  @mouseleave="hoveredRelIdx = -1"
                  @click.stop="editRelation(idx)"
                  @contextmenu.prevent.stop="removeRelation(idx)"
                  style="cursor: pointer; pointer-events: fill;"
                />
                <text
                  :x="line.midX"
                  :y="line.midY + 4"
                  text-anchor="middle"
                  font-size="10"
                  :fill="hoveredRelIdx === idx ? '#6d28d9' : '#7c3aed'"
                  class="ds-rel-label-text"
                  @click.stop="editRelation(idx)"
                  style="cursor: pointer; pointer-events: fill;"
                >{{ line.label }}</text>
              </g>
            </svg>

            <!-- 关系编辑弹窗 -->
            <div v-if="editingRel !== null" class="ds-rel-editor" :style="relEditorPos">
              <div class="ds-rel-editor__title">
                编辑关联
                <el-button size="small" text type="danger" @click="deleteEditingRelation" title="删除关联">
                  <NavIcon name="Delete" :size="12" />
                </el-button>
                <el-button size="small" text @click="editingRel = null">
                  <NavIcon name="Close" :size="12" />
                </el-button>
              </div>
              <div class="ds-rel-editor__row">
                <label>关联类型</label>
                <el-select v-model="editingRel.draft.relationType" size="small">
                  <el-option label="一对多" value="one-to-many" />
                  <el-option label="一对一" value="one-to-one" />
                  <el-option label="多对多" value="many-to-many" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>父表</label>
                <el-select v-model="editingRel.draft.parentTable" size="small">
                  <el-option v-for="t in tables" :key="t.id" :label="t.tableName" :value="t.tableName" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>父字段</label>
                <el-select v-model="editingRel.draft.parentField" size="small" filterable allow-create>
                  <el-option v-for="c in getTableByName(editingRel.draft.parentTable)?.columns ?? []" :key="c.name" :label="c.name" :value="c.name" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>子表</label>
                <el-select v-model="editingRel.draft.childTable" size="small">
                  <el-option v-for="t in tables" :key="t.id" :label="t.tableName" :value="t.tableName" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>子字段</label>
                <el-select v-model="editingRel.draft.childField" size="small" filterable allow-create>
                  <el-option v-for="c in getTableByName(editingRel.draft.childTable)?.columns ?? []" :key="c.name" :label="c.name" :value="c.name" />
                </el-select>
              </div>
              <div class="ds-rel-editor__actions">
                <el-button size="small" type="primary" @click="applyRelationEdit">确定</el-button>
                <el-button size="small" @click="editingRel = null">取消</el-button>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="tables.length === 0" class="ds-empty">
              <NavIcon name="Coin" :size="48" />
              <p>暂无表结构</p>
              <p class="ds-empty__hint">点击"添加表"或使用右侧 AI 助手生成数据模型</p>
            </div>

            <!-- 可拖拽表卡片 -->
            <div
              v-for="(table, idx) in tables"
              :key="table.id"
              class="ds-card"
              :class="{ 'ds-card--selected': selectedTableId === table.id, 'ds-card--dragging': dragState?.tableId === table.id }"
              :style="{ left: table.x + 'px', top: table.y + 'px' }"
            >
              <!-- 表头（拖拽手柄） -->
              <div
                class="ds-card__header"
                @mousedown="onCardMouseDown($event, table)"
              >
                <NavIcon name="Grid" :size="14" />
                <input :value="table.tableName" class="ds-card__title" placeholder="表名" @change="handleTableNameInputChange(table, $event)" @mousedown.stop />
                <span class="ds-card__badges">
                  <el-tag size="small" type="info" effect="plain">{{ table.columns.length }} 列</el-tag>
                  <el-tag v-if="(table.views.default.rows?.length ?? 0) > 0" size="small" type="success" effect="plain">{{ table.views.default.rows!.length }} 行</el-tag>
                </span>
                <span class="ds-card__spacer" />
                <el-button size="small" text :type="propsExpandedTables.has(table.id) ? 'primary' : 'default'" @click.stop="toggleProps(table.id)" class="ds-card__btn" title="表属性">
                  <NavIcon name="Setting" :size="12" />
                </el-button>
                <el-button size="small" text :type="expandedTables.has(table.id) ? 'primary' : 'default'" @click.stop="toggleSchema(table.id)" class="ds-card__btn" title="字段编辑">
                  <NavIcon :name="expandedTables.has(table.id) ? 'ArrowUp' : 'ArrowDown'" :size="12" />
                </el-button>
                <el-button size="small" text type="danger" @click.stop="removeTable(idx)" class="ds-card__btn">
                  <NavIcon name="Close" :size="12" />
                </el-button>
              </div>

              <!-- 字段列表（紧凑模式） -->
              <div class="ds-card__columns">
                <div v-for="col in table.columns" :key="col.id" class="ds-card__col">
                  <NavIcon :name="col.isPrimaryKey ? 'Key' : 'Document'" :size="11" />
                  <span class="ds-card__col-name" :class="{ 'ds-card__col-name--pk': col.isPrimaryKey }">{{ col.name }}</span>
                  <span class="ds-card__col-type">{{ col.type }}</span>
                  <span v-if="col.label" class="ds-card__col-label">{{ col.label }}</span>
                </div>
              </div>

              <!-- 表属性编辑 -->
              <div v-if="propsExpandedTables.has(table.id)" class="ds-card__props">
                <div class="ds-prop-row">
                  <label>资源类型</label>
                  <el-select :model-value="table.resourceType" size="small" clearable placeholder="-" @update:modelValue="handleTableSemanticChange(table, { resourceType: $event ?? undefined })" @mousedown.stop>
                    <el-option label="数据库表" value="database-table" />
                    <el-option label="数据库视图" value="database-view" />
                    <el-option label="第三方 API" value="third-party-api" />
                    <el-option label="静态数据" value="static-data" />
                    <el-option label="字典" value="dictionary" />
                    <el-option label="逻辑视图" value="logical-view" />
                  </el-select>
                </div>
                <div class="ds-prop-row">
                  <label>业务角色</label>
                  <el-select :model-value="table.businessCategory" size="small" clearable placeholder="-" @update:modelValue="handleTableSemanticChange(table, { businessCategory: $event ?? undefined })" @mousedown.stop>
                    <el-option label="主表" value="master" />
                    <el-option label="从表" value="child" />
                    <el-option label="引用表" value="reference" />
                  </el-select>
                </div>
                <div class="ds-prop-row">
                  <label>资源 ID</label>
                  <input :value="table.resourceId ?? ''" class="ds-prop-row__input" placeholder="外部标识" @change="handleTableResourceIdInputChange(table, $event)" @mousedown.stop />
                </div>
                <div class="ds-prop-row">
                  <label>API</label>
                  <input :value="typeof table.api === 'string' ? table.api : ''" class="ds-prop-row__input" placeholder="如 /api/users 或留空" @change="handleTableApiInputChange(table, $event)" @mousedown.stop />
                </div>
              </div>

              <!-- 可折叠的 schema 编辑 -->
              <div v-if="expandedTables.has(table.id)" class="ds-card__schema">
                <div v-for="(col, cidx) in table.columns" :key="col.id" class="ds-schema-row">
                  <el-checkbox :model-value="col.isPrimaryKey" size="small" title="主键" @update:modelValue="handleColumnFieldChange(table, col, { isPrimaryKey: Boolean($event) })" @mousedown.stop />
                  <input :value="col.name" class="ds-schema-row__field" placeholder="字段名" @change="handleColumnNameInputChange(table, col, $event)" @mousedown.stop />
                  <input :value="col.label ?? ''" class="ds-schema-row__label" placeholder="标签" @change="handleColumnLabelInputChange(table, col, $event)" @mousedown.stop />
                  <el-select :model-value="col.type" size="small" class="ds-schema-row__type" @update:modelValue="handleColumnTypeChange(table, col, $event)" @mousedown.stop>
                    <el-option label="string" value="string" />
                    <el-option label="number" value="number" />
                    <el-option label="boolean" value="boolean" />
                    <el-option label="date" value="date" />
                    <el-option label="datetime" value="datetime" />
                    <el-option label="object" value="object" />
                    <el-option label="array" value="array" />
                  </el-select>
                  <el-button size="small" text type="danger" @click="removeColumn(table, cidx)" class="ds-schema-row__del">
                    <NavIcon name="Minus" :size="10" />
                  </el-button>
                </div>
                <el-button size="small" text class="ds-schema-add" @click="addColumn(table)">
                  <NavIcon name="Plus" :size="10" /> 添加字段
                </el-button>
              </div>

              <!-- 底部信息栏：坐标 & 尺寸 -->
              <div class="ds-card__footer">
                <span class="ds-card__coord" title="画布坐标">
                  <NavIcon name="Aim" :size="10" />
                  {{ Math.round(table.x) }}, {{ Math.round(table.y) }}
                </span>
                <span class="ds-card__size" title="宽 × 高">
                  {{ CARD_W }} × {{ getCardHeight(table) }}
                </span>
                <span class="ds-card__id" :title="'ID: ' + table.id">
                  #{{ table.id.slice(0, 4) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：AI 设计助手 -->
      <div class="ds-ai">
        <div class="ds-ai__header">
          <NavIcon name="Cpu" :size="16" />
          <span>AI 设计助手</span>
          <el-tag size="small" type="success" effect="plain" class="ds-ai__new-tag">NEW</el-tag>
        </div>

        <div class="ds-ai__feature-tip">
          仅保留聊天模式，所有 AI 修改统一走细粒度编辑执行链路。
        </div>

        <div class="ds-ai__form">
          <div class="ds-ai__chat-widget">
            <AiChatWidget
              mode="multi"
              title="DataSet 聊天助手"
              placeholder="支持文本、附件、语音输入；可连续多轮对话"
              :compact="true"
              :sender="datasetDesignerChatSender"
            />
          </div>
        </div>

        <!-- 蓝图执行进度 -->
        <div v-if="blueprint.length > 0" class="ds-ai__blueprint">
          <div class="ds-ai__label">📋 执行计划：</div>
          <div class="ds-step" v-for="(step, idx) in blueprint" :key="idx">
            <span class="ds-step__icon">
              {{ step.status === 'done' ? '✅' : step.status === 'running' ? '⏳' : '⬜' }}
            </span>
            <span class="ds-step__name">{{ step.action }}</span>
          </div>
        </div>

        <!-- AI 响应 -->
        <div v-if="fineEditSseTrace" class="ds-ai__response">
          <div class="ds-ai__label">🛰️ SSE 与 LLM 交互：</div>
          <div class="ds-ai__text" v-html="fineEditSseTraceHtml" />
        </div>

        <div v-if="aiResponse" class="ds-ai__response">
          <div class="ds-ai__label">💡 AI 建议：</div>
          <div class="ds-ai__text" v-html="aiResponseHtml" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  clearRegistry,
  clearDomains,
  registerEditStills,
  createSession as createStillSession,
  executeStill,
  runStillsLoop,
  SessionBackendImpl,
  configureSessionBackend,
  createRepeatDetectionMonitor,
  generateToolDefinitions,
  type DialogueTurn,
} from '@spark-view/spark-ai'
import { ElMessage, ElMessageBox } from 'element-plus'
import NavIcon from '@/components/NavIcon.vue'
import AiChatWidget from '@/components/AiChatWidget.vue'
import {
  buildDataSetMetadataFromDesignerProjection,
  hasDesignerProjectionChanges,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
  type DesignerRelationProjection,
  type DesignerTableProjection,
  type DesignerTableUiState,
  type LayoutForNewTable,
} from './composables/designerProjection'
import { createAuthHeaders } from '@/services/http'
import type { AiChatSender } from '@/composables/useAiChat'
import {
  buildFineGrainedEditContext,
  buildFineGrainedLoopSystemPrompt,
  buildFineGrainedLoopUserPrompt,
  summarizeFineGrainedTurns,
} from './datasetFineEditOrchestration'
import type { DevState } from './useDevState'
import { DataSetCrudTool } from '@spark-view/spark-data'
import type { DataColumn, TableRelation, ITableMetadata, IDataSetMetadata } from '@spark-view/spark-data'

/**
 * 设计器列 — DataColumn + 画布唯一标识
 */
type DesignerColumn = DesignerTableProjection['columns'][number]
type DesignerTable = DesignerTableProjection
type DesignerRelation = DesignerRelationProjection

interface BlueprintStep {
  action: string
  status: 'pending' | 'running' | 'done'
}

interface RelationDraftState {
  sourceIndex: number
  sourceSelector: ReturnType<typeof buildRelationSelector>
  draft: DesignerRelation
}

const props = defineProps<{
  state: DevState
}>()

const tableUiState = ref<Record<string, DesignerTableUiState>>({})
const selectedTableId = ref<string | null>(null)
const expandedTables = ref<Set<string>>(new Set())
const propsExpandedTables = ref<Set<string>>(new Set())
const hoveredRelIdx = ref(-1)

// ═══ 关系编辑状态 ═══
const editingRel = ref<RelationDraftState | null>(null)
const relEditorPos = computed(() => {
  if (editingRel.value === null) return {}
  const idx = editingRel.value.sourceIndex
  const lines = relationLines.value
  if (idx < 0 || idx >= lines.length) return {}
  const line = lines[idx]!
  return {
    left: (line.midX + 10) + 'px',
    top: (line.midY - 20) + 'px',
  }
})

// ═══ Undo / Redo（DataSetCrudTool 历史栈）═══
const historyTool = shallowRef<DataSetCrudTool | null>(null)
const historyTick = ref(0)
const pendingProjectionLayout = shallowRef<LayoutForNewTable | null>(null)

function markHistoryChanged(): void {
  historyTick.value += 1
}

const projectedMetadata = computed<IDataSetMetadata | null>(() => {
  historyTick.value
  return historyTool.value?.toJson() ?? null
})

const tables = computed<DesignerTable[]>(() => {
  const metadata = projectedMetadata.value
  if (!metadata) return []

  return projectDesignerTables(metadata, tableUiState.value, generateId)
})

const relations = computed<DesignerRelation[]>(() => (
  projectedMetadata.value ? projectDesignerRelations(projectedMetadata.value) : []
))

const viewDependencies = computed<NonNullable<IDataSetMetadata['viewDependencies']> | undefined>(() => (
  projectedMetadata.value?.viewDependencies
))

const persistedPageDataMetadata = computed<IDataSetMetadata | null>(() => {
  const content = props.state.editFiles['pagedata.json']
  if (typeof content !== 'string') return null
  try {
    return DataSetCrudTool.fromJson(content).toJson()
  } catch {
    return null
  }
})

function resetHistoryFromDesignerState(): void {
  const snapshot = buildDataSetMetadataFromDesigner()
  if (!historyTool.value) {
    historyTool.value = DataSetCrudTool.fromJson(snapshot)
  } else {
    historyTool.value.replaceFromJson(snapshot, { commitHistory: false })
  }
  markHistoryChanged()
}

function isDesignerStateInSyncWithHistory(): boolean {
  if (!historyTool.value) return false
  const current = JSON.stringify(buildDataSetMetadataFromDesigner())
  const historical = JSON.stringify(historyTool.value.toJson())
  return current === historical
}

function applyMutationWithHistory(
  mutator: (tool: DataSetCrudTool) => void,
  layoutForNewTable?: LayoutForNewTable,
): void {
  if (!historyTool.value || !isDesignerStateInSyncWithHistory()) {
    resetHistoryFromDesignerState()
  }
  const tool = historyTool.value!
  try {
    pendingProjectionLayout.value = layoutForNewTable ?? null
    mutator(tool)
    markHistoryChanged()
  } catch (error) {
    pendingProjectionLayout.value = null
    throw error
  }
}

function undo() {
  if (!historyTool.value) return
  const ok = historyTool.value.undo()
  if (!ok) return
  editingRel.value = null
  selectedTableId.value = null
  markHistoryChanged()
}

function redo() {
  if (!historyTool.value) return
  const ok = historyTool.value.redo()
  if (!ok) return
  editingRel.value = null
  selectedTableId.value = null
  markHistoryChanged()
}

function commitLayoutCheckpoint(): void {
  if (!historyTool.value || !isDesignerStateInSyncWithHistory()) {
    resetHistoryFromDesignerState()
  }
  const tool = historyTool.value
  if (!tool) return
  const anchor = tables.value[0]
  if (!anchor) return
  // 通过 no-op 结构提交推进 DataSetCrudTool 历史游标，把当前 UI 布局绑定到同一撤销链。
  tool.updateTable({ tableName: anchor.tableName })
  markHistoryChanged()
}

const canUndo = computed(() => {
  historyTick.value
  return historyTool.value?.canUndo ?? false
})
const canRedo = computed(() => {
  historyTick.value
  return historyTool.value?.canRedo ?? false
})

watch(
  projectedMetadata,
  (metadata) => {
    if (!metadata) {
      tableUiState.value = {}
      pendingProjectionLayout.value = null
      return
    }

    projectDesignerFromMetadata(metadata, pendingProjectionLayout.value ?? undefined)
    pendingProjectionLayout.value = null
  },
  { flush: 'sync' },
)

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault()
    redo()
  }
}

// ═══ 拖拽状态 ═══
const dragState = ref<{
  tableId: string
  startX: number
  startY: number
  origX: number
  origY: number
} | null>(null)

const CARD_W = 260
const CARD_HEADER_H = 42
const COL_ROW_H = 24

function getCardHeight(table: DesignerTable): number {
  let base = CARD_HEADER_H + table.columns.length * COL_ROW_H + 10 + 22 // 22 = footer
  if (propsExpandedTables.value.has(table.id)) {
    base += 4 * 32 + 12 // 4 prop rows
  }
  if (expandedTables.value.has(table.id)) {
    base += table.columns.length * 32 + 36
  }
  return base
}

const canvasSize = computed(() => {
  let maxW = 800
  let maxH = 600
  for (const t of tables.value) {
    maxW = Math.max(maxW, t.x + CARD_W + 60)
    maxH = Math.max(maxH, t.y + getCardHeight(t) + 60)
  }
  return { width: maxW, height: maxH }
})

const canvasInnerStyle = computed(() => ({
  width: canvasSize.value.width + 'px',
  height: canvasSize.value.height + 'px',
}))

// ═══ 关系连线计算 ═══
const relationLines = computed(() => {
  return relations.value.map((rel) => {
    const from = tables.value.find((t) => t.tableName === rel.parentTable)
    const to = tables.value.find((t) => t.tableName === rel.childTable)
    if (!from || !to) return null

    const fromH = getCardHeight(from)
    const toH = getCardHeight(to)
    const fromCx = from.x + CARD_W / 2
    const toCx = to.x + CARD_W / 2

    let x1: number, y1: number, x2: number, y2: number

    if (fromCx <= toCx) {
      x1 = from.x + CARD_W
      y1 = from.y + fromH / 2
      x2 = to.x
      y2 = to.y + toH / 2
    } else {
      x1 = from.x
      y1 = from.y + fromH / 2
      x2 = to.x + CARD_W
      y2 = to.y + toH / 2
    }

    const dx = Math.abs(x2 - x1)
    const tension = Math.max(dx * 0.4, 50)
    const cp1x = x1 + (x1 <= x2 ? tension : -tension)
    const cp2x = x2 + (x1 <= x2 ? -tension : tension)
    const path = `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`

    const label = `${rel.parentField ?? ''} → ${rel.childField ?? ''}`
    const labelW = label.length * 6.5 + 4
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2

    return { path, label, labelW, midX, midY }
  }).filter((v): v is NonNullable<typeof v> => v !== null)
})

const aiResponse = ref('')
const fineEditSseLines = ref<string[]>([])
const blueprint = ref<BlueprintStep[]>([])
const fineEditSession = shallowRef<ReturnType<typeof createStillSession> | null>(null)
const fineEditBackend = shallowRef<SessionBackendImpl | null>(null)
const fineEditBackendSessionId = ref<string | null>(null)

const hasChanges = computed(() => {
  return hasDesignerProjectionChanges(buildDataSetMetadataFromDesigner(), persistedPageDataMetadata.value)
})

// ═══ 自动从 pagedata.json 加载 ═══

onMounted(async () => {
  // 主动加载 pagedata.json（可能尚未被文件编辑器加载过）
  if (!props.state.editFiles['pagedata.json'] && props.state.activePageId.value) {
    await props.state.loadPageFile('pagedata.json')
  }
  if (props.state.editFiles['pagedata.json']) {
    parseFromPageData(true)
  }
  document.addEventListener('keydown', onKeydown)
})

watch(
  () => props.state.editFiles['pagedata.json'],
  () => {
    // 外部修改 pagedata.json 时自动重新加载
    if (!hasChanges.value) {
      parseFromPageData(true)
    }
  },
)

const aiResponseHtml = computed(() => {
  if (!aiResponse.value) return ''
  return aiResponse.value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
})

const fineEditSseTrace = computed(() => fineEditSseLines.value.join('\n'))

const fineEditSseTraceHtml = computed(() => {
  if (!fineEditSseTrace.value) return ''
  return fineEditSseTrace.value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
})

const AI_STREAM_PREFIX = 'AI: '
const REASONING_STREAM_PREFIX = '思考: '

function pushFineEditSseLine(line: string) {
  if (!line.trim()) return
  fineEditSseLines.value.push(line)
  if (fineEditSseLines.value.length > 120) {
    fineEditSseLines.value.splice(0, fineEditSseLines.value.length - 120)
  }
}

function upsertFineEditStreamingLine(prefix: string, chunk: string) {
  if (!chunk) return
  const lastIdx = fineEditSseLines.value.length - 1
  const lastLine = lastIdx >= 0 ? fineEditSseLines.value[lastIdx] : undefined
  if (lastLine !== undefined && lastLine.startsWith(prefix)) {
    fineEditSseLines.value[lastIdx] = lastLine + chunk
    return
  }
  pushFineEditSseLine(`${prefix}${chunk}`)
}

function closeFineEditStreamingLines() {
  const lastIdx = fineEditSseLines.value.length - 1
  if (lastIdx < 0) return
  const lastLine = fineEditSseLines.value[lastIdx]
  if (lastLine !== undefined && (lastLine.startsWith(AI_STREAM_PREFIX) || lastLine.startsWith(REASONING_STREAM_PREFIX))) {
    fineEditSseLines.value[lastIdx] = lastLine.trimEnd()
  }
}

function onFineEditSseEvent(event: { sessionId: string; type: string; data: string }) {
  if (event.type === 'delta') {
    upsertFineEditStreamingLine(AI_STREAM_PREFIX, event.data)
    return
  }

  if (event.type === 'reasoning') {
    upsertFineEditStreamingLine(REASONING_STREAM_PREFIX, event.data)
    return
  }

  if (event.type === 'result') {
    closeFineEditStreamingLines()
    try {
      const parsed = JSON.parse(event.data) as {
        text?: string
        toolCalls?: Array<{ function?: { name?: string; arguments?: string } }>
      }
      if (parsed.text && parsed.text.trim()) {
        pushFineEditSseLine(`结果: ${parsed.text}`)
      }
      if (Array.isArray(parsed.toolCalls) && parsed.toolCalls.length > 0) {
        const actionList = parsed.toolCalls
          .map(tc => tc.function?.name)
          .filter((name): name is string => Boolean(name && name.length > 0))
        if (actionList.length > 0) {
          pushFineEditSseLine(`工具调用: ${actionList.join(', ')}`)
        }
      }
    } catch {
      pushFineEditSseLine(`结果(raw): ${event.data}`)
    }
    return
  }

  if (event.type === 'error') {
    closeFineEditStreamingLines()
    pushFineEditSseLine(`错误: ${event.data}`)
  }
}

function onFineEditTurnComplete(turn: DialogueTurn) {
  if (turn.phase !== 'stills-execute' || !turn.toolBlock || !turn.stillsResult) return
  const { action, id } = turn.toolBlock
  const result = turn.stillsResult

  if (result.ok) {
    const warningCount = result.warnings?.length ?? 0
    if (warningCount > 0) {
      pushFineEditSseLine(`[Round ${turn.round}] 执行 ${action}(${id}) -> 成功，warnings=${warningCount}`)
      for (const warning of result.warnings ?? []) {
        pushFineEditSseLine(`  - warning[${warning.rule}]: ${warning.detail}${warning.fix ? ` | fix: ${warning.fix}` : ''}`)
      }
    } else {
      pushFineEditSseLine(`[Round ${turn.round}] 执行 ${action}(${id}) -> 成功`)
    }
    return
  }

  pushFineEditSseLine(
    `[Round ${turn.round}] 执行 ${action}(${id}) -> 失败` +
    `${result.code ? ` | code=${result.code}` : ''}` +
    `${result.msg ? ` | msg=${result.msg}` : ''}` +
    `${result.fix ? ` | fix=${result.fix}` : ''}`,
  )
}

type FineEditFailureTurn = Pick<DialogueTurn, 'phase' | 'toolBlock' | 'stillsResult'>

function buildFineEditFailureDetails(turns: FineEditFailureTurn[]): string {
  const executedActions = turns
    .filter(turn => turn.phase === 'stills-execute' && turn.toolBlock)
    .map(turn => turn.toolBlock!.action)

  const lastFailure = [...turns]
    .reverse()
    .find(turn => turn.phase === 'stills-execute' && turn.stillsResult && !turn.stillsResult.ok)

  const actionSummary = executedActions.length > 0
    ? executedActions.join(' -> ')
    : '（未记录到工具执行）'

  if (!lastFailure || !lastFailure.stillsResult) {
    return `已执行动作链：${actionSummary}`
  }

  const failedAction = lastFailure.toolBlock?.action ?? 'unknown'
  const failedResult = lastFailure.stillsResult
  return `已执行动作链：${actionSummary}\n最后失败点：${failedAction}`
    + `${failedResult.code ? ` | code=${failedResult.code}` : ''}`
    + `${failedResult.msg ? ` | msg=${failedResult.msg}` : ''}`
    + `${failedResult.fix ? ` | fix=${failedResult.fix}` : ''}`
}

function normalizeRelation(rel: DesignerRelation): TableRelation {
  return {
    parentTable: rel.parentTable,
    childTable: rel.childTable,
    ...(rel.parentField !== undefined ? { parentField: rel.parentField } : {}),
    ...(rel.childField !== undefined ? { childField: rel.childField } : {}),
    ...(rel.relationName !== undefined ? { relationName: rel.relationName } : {}),
    ...(rel.condition !== undefined ? { condition: rel.condition } : {}),
    ...(rel.cascadeUpdate !== undefined ? { cascadeUpdate: rel.cascadeUpdate } : {}),
    ...(rel.cascadeDelete !== undefined ? { cascadeDelete: rel.cascadeDelete } : {}),
  }
}

function buildRelationSelector(rel: {
  parentTable: string
  childTable: string
  parentField?: string
  childField?: string
}): {
  parentTable: string
  childTable: string
  parentField?: string
  childField?: string
} {
  return {
    parentTable: rel.parentTable,
    childTable: rel.childTable,
    ...(rel.parentField ? { parentField: rel.parentField } : {}),
    ...(rel.childField ? { childField: rel.childField } : {}),
  }
}

function deleteTableWithRelationFallback(
  tool: DataSetCrudTool,
  tableName: string,
  currentRelations: DesignerRelation[],
): void {
  try {
    tool.deleteTable(tableName)
  } catch {
    // 兜底：若依赖导致 deleteTable 失败，先清理关联再删。
    for (const rel of currentRelations) {
      if (rel.parentTable === tableName || rel.childTable === tableName) {
        tool.deleteRelation(buildRelationSelector(rel))
      }
    }
    tool.deleteTable(tableName)
  }
}

function readCurrentDataSetName(): string {
  if (historyTool.value) {
    return historyTool.value.dataSetName
  }

  try {
    const content = props.state.editFiles['pagedata.json'] ?? '{}'
    return DataSetCrudTool.fromJson(content).dataSetName
  } catch {
    // ignore
  }
  return 'PageDataSet'
}

function buildDataSetMetadataFromDesigner(): IDataSetMetadata {
  return buildDataSetMetadataFromDesignerProjection({
    dataSetName: readCurrentDataSetName(),
    tables: tables.value,
    relations: relations.value,
    ...(viewDependencies.value ? { viewDependencies: viewDependencies.value } : {}),
  })
}

function projectDesignerFromMetadata(
  metadata: IDataSetMetadata,
  layoutForNewTable?: LayoutForNewTable,
): void {
  tableUiState.value = reconcileDesignerTableUiState(metadata, tables.value, generateId, layoutForNewTable)
}

// ═══ 表操作 ═══

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function addTable() {
  const tableCount = tables.value.length
  const tableName = `table_${tableCount + 1}`
  applyMutationWithHistory((tool) => {
    tool.createTable({
      tableName,
      columns: [{ name: 'id', label: 'ID', type: 'number', isPrimaryKey: true }],
      views: { default: { rows: [] } },
    })
  }, (_name, i) => ({
    x: 50 + ((tableCount + i) % 3) * 220,
    y: 50 + Math.floor((tableCount + i) / 3) * 200,
  }))
}

async function removeTable(idx: number) {
  const table = tables.value[idx]
  if (!table) return
  try {
    await ElMessageBox.confirm(
      `确定删除表「${table.tableName}」及其关联关系？`,
      '删除表',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch { return }
  const tableId = table.id
  const name = table.tableName
  applyMutationWithHistory((tool) => {
    deleteTableWithRelationFallback(tool, name, [...relations.value])
  })
  if (selectedTableId.value === tableId) {
    selectedTableId.value = null
  }
}

function addColumn(table: DesignerTable) {
  applyMutationWithHistory((tool) => {
    tool.createColumn({
      tableName: table.tableName,
      column: {
        name: `field_${table.columns.length}`,
        label: '',
        type: 'string',
        isPrimaryKey: false,
      },
    })
  })
}

function readInputValue(event: Event): string {
  return (event.target as HTMLInputElement | null)?.value ?? ''
}

function applyMutationWithFeedback(action: () => void, failureTitle: string): void {
  try {
    action()
  } catch (error) {
    ElMessage.error(`${failureTitle}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function handleTableNameInputChange(table: DesignerTable, event: Event): void {
  const nextName = readInputValue(event).trim()
  if (!nextName || nextName === table.tableName) return
  applyMutationWithFeedback(() => {
    applyMutationWithHistory((tool) => {
      tool.renameTable({ tableName: table.tableName, newTableName: nextName })
    })
  }, '表名更新失败')
}

function handleTableSemanticChange(
  table: DesignerTable,
  updates: Partial<Pick<ITableMetadata, 'resourceType' | 'businessCategory'>>,
): void {
  applyMutationWithFeedback(() => {
    applyMutationWithHistory((tool) => {
      tool.updateTable({ tableName: table.tableName, ...updates })
    })
  }, '表属性更新失败')
}

function handleTableResourceIdInputChange(table: DesignerTable, event: Event): void {
  const value = readInputValue(event).trim()
  applyMutationWithFeedback(() => {
    applyMutationWithHistory((tool) => {
      tool.updateTable({ tableName: table.tableName, resourceId: value || null })
    })
  }, '资源 ID 更新失败')
}

function handleTableApiInputChange(table: DesignerTable, event: Event): void {
  const value = readInputValue(event).trim()
  applyMutationWithFeedback(() => {
    applyMutationWithHistory((tool) => {
      tool.updateTable({ tableName: table.tableName, api: value || false })
    })
  }, 'API 更新失败')
}

function handleColumnFieldChange(table: DesignerTable, column: DesignerColumn, updates: Partial<DataColumn>): void {
  applyMutationWithFeedback(() => {
    applyMutationWithHistory((tool) => {
      tool.updateColumn({ tableName: table.tableName, columnName: column.name, updates })
    })
  }, '字段更新失败')
}

function handleColumnNameInputChange(table: DesignerTable, column: DesignerColumn, event: Event): void {
  const nextName = readInputValue(event).trim()
  if (!nextName || nextName === column.name) return
  applyMutationWithFeedback(() => {
    applyMutationWithHistory((tool) => {
      tool.renameColumn({ tableName: table.tableName, columnName: column.name, newColumnName: nextName })
    })
  }, '字段名更新失败')
}

function handleColumnLabelInputChange(table: DesignerTable, column: DesignerColumn, event: Event): void {
  const nextLabel = readInputValue(event)
  if (nextLabel === (column.label ?? '')) return
  handleColumnFieldChange(table, column, { label: nextLabel })
}

function handleColumnTypeChange(table: DesignerTable, column: DesignerColumn, nextType: unknown): void {
  if (typeof nextType !== 'string' || nextType === column.type) return
  handleColumnFieldChange(table, column, { type: nextType })
}

function removeColumn(table: DesignerTable, idx: number) {
  const column = table.columns[idx]
  if (!column) return
  applyMutationWithHistory((tool) => {
    tool.deleteColumn({ tableName: table.tableName, columnName: column.name })
  })
}

// ═══ 关联操作 ═══

async function addRelation() {
  if (tables.value.length < 2) {
    ElMessage.warning('至少需要两个表才能创建关联')
    return
  }
  const parentTable = tables.value[0]!.tableName
  const childTable = tables.value[1]!.tableName
  applyMutationWithHistory((tool) => {
    tool.createRelation({
      parentTable,
      childTable,
      parentField: 'id',
      childField: `${parentTable}Id`,
    })
  })
  const newIdx = relations.value.length - 1
  // 打开编辑弹窗
  editRelation(newIdx)
}

function getTableByName(name: string | undefined): DesignerTable | undefined {
  return tables.value.find((t) => t.tableName === name)
}

function removeRelation(idx: number) {
  const rel = relations.value[idx]
  if (!rel) return
  applyMutationWithHistory((tool) => {
    tool.deleteRelation(buildRelationSelector(rel))
  })
  if (editingRel.value?.sourceIndex === idx) editingRel.value = null
}

function editRelation(idx: number) {
  const rel = relations.value[idx]
  if (!rel) return
  editingRel.value = {
    sourceIndex: idx,
    sourceSelector: buildRelationSelector(rel),
    draft: { ...rel },
  }
}

function applyRelationEdit() {
  if (!editingRel.value) return
  const { sourceSelector, draft } = editingRel.value
  applyMutationWithHistory((tool) => {
    tool.updateRelation({
      selector: sourceSelector,
      updates: normalizeRelation(draft),
    })
  })
  editingRel.value = null
}

async function deleteEditingRelation() {
  if (!editingRel.value) return
  try {
    await ElMessageBox.confirm(
      '确定删除该关联关系？',
      '删除关联',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch { return }
  const idx = editingRel.value.sourceIndex
  const rel = relations.value[idx]
  editingRel.value = null
  if (!rel) return
  applyMutationWithHistory((tool) => {
    tool.deleteRelation(buildRelationSelector(rel))
  })
}

function toggleSchema(tableId: string) {
  if (expandedTables.value.has(tableId)) {
    expandedTables.value.delete(tableId)
  } else {
    expandedTables.value.add(tableId)
  }
  expandedTables.value = new Set(expandedTables.value)
}

function toggleProps(tableId: string) {
  if (propsExpandedTables.value.has(tableId)) {
    propsExpandedTables.value.delete(tableId)
  } else {
    propsExpandedTables.value.add(tableId)
  }
  propsExpandedTables.value = new Set(propsExpandedTables.value)
}

async function clearAll() {
  try {
    await ElMessageBox.confirm(
      `确定清空所有 ${tables.value.length} 个表和 ${relations.value.length} 个关联？此操作可通过 Ctrl+Z 撤销。`,
      '清空画布',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' },
    )
  } catch { return }
  applyMutationWithHistory((tool) => {
    for (const name of tables.value.map(table => table.tableName)) {
      deleteTableWithRelationFallback(tool, name, [...relations.value])
    }
  })
  selectedTableId.value = null
}

function autoLayout() {
  const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(tables.value.length))))
  const nextUiState: Record<string, DesignerTableUiState> = { ...tableUiState.value }
  tables.value.forEach((table, i) => {
    nextUiState[table.tableName] = {
      id: nextUiState[table.tableName]?.id ?? table.id,
      columnIds: nextUiState[table.tableName]?.columnIds ?? Object.fromEntries(table.columns.map((column) => [column.name, column.id])),
      x: 40 + (i % cols) * 320,
      y: 40 + Math.floor(i / cols) * 280,
    }
  })
  tableUiState.value = nextUiState
  commitLayoutCheckpoint()
}

// ═══ 拖拽交互 ═══

function onCardMouseDown(e: MouseEvent, table: DesignerTable) {
  const target = e.target as HTMLElement
  if (target.closest('input, .el-select, .el-button, .el-tag')) return

  dragState.value = {
    tableId: table.id,
    startX: e.clientX,
    startY: e.clientY,
    origX: table.x,
    origY: table.y,
  }
  selectedTableId.value = table.id
  document.addEventListener('mousemove', onDocMouseMove)
  document.addEventListener('mouseup', onDocMouseUp)
  e.preventDefault()
}

function onDocMouseMove(e: MouseEvent) {
  if (!dragState.value) return
  const dx = e.clientX - dragState.value.startX
  const dy = e.clientY - dragState.value.startY
  const table = tables.value.find((t) => t.id === dragState.value!.tableId)
  if (table) {
    tableUiState.value = {
      ...tableUiState.value,
      [table.tableName]: {
        id: table.id,
        columnIds: tableUiState.value[table.tableName]?.columnIds ?? Object.fromEntries(table.columns.map((column) => [column.name, column.id])),
        x: Math.max(0, dragState.value.origX + dx),
        y: Math.max(0, dragState.value.origY + dy),
      },
    }
  }
}

function onDocMouseUp() {
  if (dragState.value) {
    const table = tables.value.find((t) => t.id === dragState.value!.tableId)
    const moved = Boolean(table)
      && (table!.x !== dragState.value.origX || table!.y !== dragState.value.origY)
    if (moved) {
      commitLayoutCheckpoint()
    }
  }
  dragState.value = null
  document.removeEventListener('mousemove', onDocMouseMove)
  document.removeEventListener('mouseup', onDocMouseUp)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDocMouseMove)
  document.removeEventListener('mouseup', onDocMouseUp)
  document.removeEventListener('keydown', onKeydown)

  const backend = fineEditBackend.value
  const sessionId = fineEditBackendSessionId.value
  if (backend && sessionId) {
    void backend.destroySession(sessionId)
  }

  clearRegistry()
  clearDomains()
})

// ═══ pagedata.json 互转 ═══

function parseFromPageData(silent = false, options?: { preserveHistory?: boolean }) {
  try {
    const content = props.state.editFiles['pagedata.json'] ?? '{}'

    const canPreserveHistory = Boolean(options?.preserveHistory && isDesignerStateInSyncWithHistory())
    const nextTool = DataSetCrudTool.reconcileFromJson(content, historyTool.value ?? undefined, {
      preserveHistory: canPreserveHistory,
    })
    historyTool.value = nextTool
    editingRel.value = null
    selectedTableId.value = null
    markHistoryChanged()
    
    if (!silent) ElMessage.success(`已加载 ${tables.value.length} 个表`)
  } catch {
    if (!silent) ElMessage.error('解析 pagedata.json 失败')
  }
}

function exportToPageData() {
  let existingMeta: IDataSetMetadata | null = null
  try {
    const existing = DataSetCrudTool.fromJson(props.state.editFiles['pagedata.json'] ?? '{}')
    existingMeta = existing.toJson()
  } catch { /* ignore */ }

  if (!historyTool.value || !isDesignerStateInSyncWithHistory()) {
    resetHistoryFromDesignerState()
  }
  const tool = historyTool.value
  if (!tool) {
    ElMessage.error('导出失败：DataSet 工具实例不可用')
    return
  }
  const toolJson = tool.toJson()

  const pageData: IDataSetMetadata = {
    ...toolJson,
    dataSetName: existingMeta?.dataSetName ?? toolJson.dataSetName,
    ...(existingMeta?.pageId ? { pageId: existingMeta.pageId } : {}),
    ...(Array.isArray(existingMeta?.viewDependencies)
      ? { viewDependencies: existingMeta.viewDependencies }
      : toolJson.viewDependencies !== undefined
        ? { viewDependencies: toolJson.viewDependencies }
        : {}),
  }

  const newContent = JSON.stringify(pageData, null, 2)
  props.state.updatePageFile('pagedata.json', newContent)
  ElMessage.success('已导出到 pagedata.json')
}

// ═══ AI 细粒度聊天编辑 ═══

async function applyFineGrainedEdit(prompt: string) {
  if (!prompt.trim()) return ''

  aiResponse.value = ''
  fineEditSseLines.value = []
  blueprint.value = []

  let lastTurns: DialogueTurn[] = []

  try {
    const currentDataSet = buildDataSetMetadataFromDesigner()
    const contextSummary = buildFineGrainedEditContext(currentDataSet)

    configureSessionBackend({
      getHeaders: createAuthHeaders,
      onSseEvent: onFineEditSseEvent,
    })
    if (!fineEditSession.value || !fineEditBackend.value) {
      clearRegistry()
      clearDomains()
      registerEditStills()

      const session = createStillSession()
      const initResult = executeStill('edit.bootstrap', {
        ruleJson: [],
        pageDataJson: currentDataSet,
        scriptJs: '',
        styleCss: '',
      }, session, 'dataset-fine-edit-bootstrap')

      if (!initResult.ok) {
        throw new Error(initResult.msg)
      }

      fineEditSession.value = session
      fineEditBackend.value = new SessionBackendImpl()
    }

    const session = fineEditSession.value
    const backend = fineEditBackend.value
    if (!session || !backend) {
      throw new Error('细粒度会话初始化失败')
    }

    const orchestratorResult = await runStillsLoop(
      buildFineGrainedLoopUserPrompt(prompt, contextSummary),
      session,
      backend,
      {
        maxRounds: 8,
        slidingWindow: 12,
        systemPrompt: buildFineGrainedLoopSystemPrompt(),
        ...(fineEditBackendSessionId.value ? { resumeSessionId: fineEditBackendSessionId.value } : {}),
        tools: generateToolDefinitions({
          compactDescriptions: true,
        }),
        monitors: [
          {
            name: 'bootstrap-guard',
            afterStillExecution(ctx) {
              const action = ctx.currentTurn.toolBlock?.action ?? ''
              const bootstrapActions = new Set(['session.describe', 'stills.capabilities'])
              if (!bootstrapActions.has(action)) return []

              const count = ctx.allTurns.filter(t => t.toolBlock?.action === action).length
              if (count <= 1) return []

              return [
                `[流程约束] ${action} 已重复 ${count} 次。请停止重复能力探测，直接执行 datasetTool.* 完成模型修改。`,
              ]
            },
          },
          createRepeatDetectionMonitor({
            maxSameSignature: 2,
            maxConsecutiveErrors: 2,
          }),
        ],
        onTurnComplete(turn) {
          onFineEditTurnComplete(turn)
        },
      },
    )
    fineEditBackendSessionId.value = orchestratorResult.sessionId
    lastTurns = orchestratorResult.turns

    if (orchestratorResult.aborted) {
      const details = buildFineEditFailureDetails(orchestratorResult.turns)
      throw new Error(`${orchestratorResult.abortReason ?? '细粒度编排被中止'}\n${details}`)
    }

    const exportResult = executeStill('dataset.export', {}, session, 'dataset-fine-edit-local-export')
    if (!exportResult.ok) {
      throw new Error(exportResult.msg)
    }

    const exportData = exportResult.data as { file: { 'pagedata.json': string } }
    const pagedata = exportData.file['pagedata.json']
    props.state.updatePageFile('pagedata.json', pagedata)
    parseFromPageData(true, { preserveHistory: true })

    aiResponse.value = `${summarizeFineGrainedTurns(orchestratorResult.turns)}

当前 ${tables.value.length} 个表、${relations.value.length} 个关联。`
  } catch (err) {
    if (lastTurns.length > 0) {
      pushFineEditSseLine('--- 失败定位摘要 ---')
      pushFineEditSseLine(buildFineEditFailureDetails(lastTurns))
    }
    aiResponse.value = `细粒度编辑失败: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    configureSessionBackend({ getHeaders: createAuthHeaders })
  }

  return aiResponse.value.trim()
}

const datasetDesignerChatSender: AiChatSender = async (request) => {
  const latestUserMessage = [...request.historyMsgs]
    .reverse()
    .find(message => message.role === 'user')

  const prompt = latestUserMessage?.content?.trim() ?? ''
  if (!prompt) return

  request.onDelta?.('已接收需求，正在执行 DataSet 细粒度编辑...\n')

  const result = await applyFineGrainedEdit(prompt)
  if (!result) {
    request.onDelta?.('细粒度编辑已执行完成。')
    return
  }

  if (result.startsWith('细粒度编辑失败:')) {
    throw new Error(result)
  }

  request.onDelta?.(result)
}
</script>

<style scoped>
.dataset-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #f8fafc;
  overflow: hidden;
}

.ds-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ede9fe 0%, #e0f2fe 100%);
  border-bottom: 1px solid #d4d4d8;
}

.ds-header__left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ds-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.ds-header__actions {
  display: flex;
  gap: 8px;
}

.ds-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ═══ 画布 ═══ */

.ds-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e2e8f0;
  min-width: 0;
}

.ds-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.ds-toolbar__info {
  margin-left: auto;
  font-size: 12px;
  color: #94a3b8;
}

.ds-toolbar__sep {
  width: 1px;
  height: 20px;
  background: #e2e8f0;
  margin: 0 4px;
}

/* 画布视口 */
.ds-viewport {
  flex: 1;
  overflow: auto;
  position: relative;
}

.ds-canvas-inner {
  position: relative;
  min-width: 100%;
  min-height: 100%;
  background-image:
    radial-gradient(circle, #d4d4d8 1px, transparent 1px);
  background-size: 20px 20px;
}

/* SVG 连线层 */
.ds-svg-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
}

.ds-rel-line {
  transition: stroke 0.15s, stroke-width 0.15s;
  pointer-events: stroke !important;
  stroke-linecap: round;
}

.ds-rel-line--hover {
  stroke: #7c3aed !important;
  stroke-width: 3 !important;
}

.ds-rel-label-bg {
  pointer-events: fill !important;
  cursor: pointer;
  transition: fill 0.15s, stroke 0.15s;
}

.ds-rel-label-text {
  pointer-events: fill !important;
  cursor: pointer;
  font-family: system-ui, sans-serif;
}

/* ═══ 关系编辑弹窗 ═══ */
.ds-rel-editor {
  position: absolute;
  z-index: 20;
  width: 240px;
  background: #fff;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
  padding: 10px 12px;
}

.ds-rel-editor__title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
}

.ds-rel-editor__title .el-button {
  margin-left: auto;
}

.ds-rel-editor__title .el-button + .el-button {
  margin-left: 0;
}

.ds-rel-editor__row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.ds-rel-editor__row label {
  width: 48px;
  font-size: 11px;
  color: #64748b;
  flex-shrink: 0;
}

.ds-rel-editor__row .el-select {
  flex: 1;
}

.ds-rel-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

/* ═══ 可拖拽表卡片 ═══ */

.ds-card {
  position: absolute;
  width: 260px;
  background: #fff;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
  z-index: 2;
  transition: box-shadow 0.15s, border-color 0.15s;
  user-select: none;
}

.ds-card:hover {
  border-color: #a5b4fc;
}

.ds-card--selected {
  border-color: #7c3aed;
  box-shadow: 0 4px 16px rgb(124 58 237 / 20%);
}

.ds-card--dragging {
  opacity: 0.9;
  box-shadow: 0 8px 24px rgb(0 0 0 / 15%);
  z-index: 10;
  cursor: grabbing;
}

.ds-card__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: linear-gradient(135deg, #ede9fe 0%, #fce7f3 100%);
  border-bottom: 1px solid #e2e8f0;
  border-radius: 6px 6px 0 0;
  cursor: grab;
  overflow: hidden;
}

.ds-card--dragging .ds-card__header {
  cursor: grabbing;
}

.ds-card__title {
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  outline: none;
  min-width: 50px;
  max-width: 80px;
  cursor: text;
}

.ds-card__badges {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.ds-card__spacer {
  flex: 1;
  min-width: 0;
}

.ds-card__btn {
  padding: 2px !important;
  width: 22px !important;
  height: 22px !important;
  flex-shrink: 0;
}

/* 紧凑字段列表 */
.ds-card__columns {
  padding: 4px 0;
}

.ds-card__col {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  font-size: 12px;
  color: #475569;
}

.ds-card__col-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-card__col-name--pk {
  font-weight: 600;
  color: #7c3aed;
}

.ds-card__col-type {
  font-size: 10px;
  color: #94a3b8;
  padding: 1px 4px;
  background: #f1f5f9;
  border-radius: 3px;
  flex-shrink: 0;
}

.ds-card__col-label {
  font-size: 10px;
  color: #a1a1aa;
  flex-shrink: 0;
}

/* 表属性编辑区 */
.ds-card__props {
  padding: 6px 10px;
  background: #eff6ff;
  border-top: 1px solid #dbeafe;
}

.ds-prop-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.ds-prop-row label {
  width: 56px;
  font-size: 10px;
  color: #64748b;
  flex-shrink: 0;
}

.ds-prop-row .el-select {
  flex: 1;
  --el-select-input-font-size: 11px;
}

.ds-prop-row__input {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  background: transparent;
  font-size: 11px;
  color: #334155;
  outline: none;
  padding: 2px 6px;
  border-radius: 3px;
}

.ds-prop-row__input:hover,
.ds-prop-row__input:focus {
  border-color: #93c5fd;
  background: #f0f9ff;
}

/* Schema 编辑区（折叠） */
.ds-card__schema {
  padding: 6px 10px;
  background: #fafafa;
  border-top: 1px solid #f1f5f9;
}

.ds-schema-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
  border-bottom: 1px dashed #f1f5f9;
}

.ds-schema-row:last-of-type {
  border-bottom: none;
}

.ds-schema-row .el-checkbox {
  --el-checkbox-input-width: 14px;
  --el-checkbox-input-height: 14px;
  margin-right: 0;
}

.ds-schema-row__field {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  background: transparent;
  font-size: 11px;
  color: #334155;
  outline: none;
  padding: 2px 4px;
  border-radius: 3px;
}

.ds-schema-row__field:hover,
.ds-schema-row__field:focus {
  border-color: #c4b5fd;
  background: #faf5ff;
}

.ds-schema-row__label {
  width: 50px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 10px;
  color: #94a3b8;
  outline: none;
  text-align: right;
  padding: 2px 4px;
  border-radius: 3px;
}

.ds-schema-row__label:hover,
.ds-schema-row__label:focus {
  border-color: #c4b5fd;
  background: #faf5ff;
}

.ds-schema-row__type {
  width: 78px;
  --el-select-input-font-size: 10px;
}

.ds-schema-row__del {
  padding: 2px !important;
  width: 18px !important;
  height: 18px !important;
  flex-shrink: 0;
}

.ds-schema-add {
  width: 100%;
  margin-top: 4px;
  font-size: 10px;
}

/* 卡片底部信息栏 */
.ds-card__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  border-radius: 0 0 6px 6px;
  font-size: 9px;
  color: #94a3b8;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}

.ds-card__coord {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ds-card__size {
  opacity: 0.7;
}

.ds-card__id {
  margin-left: auto;
  opacity: 0.5;
}

/* 空状态 */
.ds-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #94a3b8;
  z-index: 0;
}

.ds-empty p {
  margin: 8px 0 0;
}

.ds-empty__hint {
  font-size: 12px;
  color: #cbd5e1;
}

/* ═══ 右侧 AI 助手 ═══ */

.ds-ai {
  width: 320px;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.ds-ai__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
  color: #7c3aed;
  border-bottom: 1px solid #e2e8f0;
}

.ds-ai__new-tag {
  margin-left: auto;
}

.ds-ai__feature-tip {
  margin: 10px 14px 0;
  padding: 8px 10px;
  border: 1px dashed #86efac;
  border-radius: 8px;
  background: #f0fdf4;
  color: #166534;
  font-size: 12px;
  line-height: 1.5;
}

.ds-ai__form {
  padding: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.ds-ai__chat-widget {
  margin-top: 8px;
}

.ds-ai__chat-widget :deep(.ai-chat-widget.compact) {
  height: 100%;
  min-height: 0;
}

.ds-ai__label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #334155;
}

.ds-ai__blueprint {
  padding: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.ds-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  color: #64748b;
}

.ds-step__icon {
  width: 16px;
  text-align: center;
}

.ds-ai__response {
  flex: 1;
  padding: 14px;
  overflow-y: auto;
}

.ds-ai__text {
  font-size: 13px;
  line-height: 1.6;
  color: #374151;
}

.ds-ai__text :deep(p) {
  margin: 0 0 8px;
}

.ds-ai__text :deep(code) {
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
