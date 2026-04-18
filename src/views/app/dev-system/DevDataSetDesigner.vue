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
        <div class="ds-viewport" ref="viewportRef">
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
                <el-select v-model="editingRel.relationType" size="small">
                  <el-option label="一对多" value="one-to-many" />
                  <el-option label="一对一" value="one-to-one" />
                  <el-option label="多对多" value="many-to-many" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>父表</label>
                <el-select v-model="editingRel.parentTable" size="small">
                  <el-option v-for="t in tables" :key="t.id" :label="t.tableName" :value="t.tableName" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>父字段</label>
                <el-select v-model="editingRel.parentField" size="small" filterable allow-create>
                  <el-option v-for="c in getTableByName(editingRel.parentTable)?.columns ?? []" :key="c.name" :label="c.name" :value="c.name" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>子表</label>
                <el-select v-model="editingRel.childTable" size="small">
                  <el-option v-for="t in tables" :key="t.id" :label="t.tableName" :value="t.tableName" />
                </el-select>
              </div>
              <div class="ds-rel-editor__row">
                <label>子字段</label>
                <el-select v-model="editingRel.childField" size="small" filterable allow-create>
                  <el-option v-for="c in getTableByName(editingRel.childTable)?.columns ?? []" :key="c.name" :label="c.name" :value="c.name" />
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
                <input v-model="table.tableName" class="ds-card__title" placeholder="表名" @mousedown.stop />
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
                  <el-select v-model="table.resourceType" size="small" clearable placeholder="-" @mousedown.stop>
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
                  <el-select v-model="table.businessCategory" size="small" clearable placeholder="-" @mousedown.stop>
                    <el-option label="主表" value="master" />
                    <el-option label="从表" value="child" />
                    <el-option label="引用表" value="reference" />
                  </el-select>
                </div>
                <div class="ds-prop-row">
                  <label>资源 ID</label>
                  <input v-model="table.resourceId" class="ds-prop-row__input" placeholder="外部标识" @mousedown.stop />
                </div>
                <div class="ds-prop-row">
                  <label>API</label>
                  <input v-model="table.api" class="ds-prop-row__input" placeholder="如 /api/users 或留空" @mousedown.stop />
                </div>
              </div>

              <!-- 可折叠的 schema 编辑 -->
              <div v-if="expandedTables.has(table.id)" class="ds-card__schema">
                <div v-for="(col, cidx) in table.columns" :key="col.id" class="ds-schema-row">
                  <el-checkbox v-model="col.isPrimaryKey" size="small" title="主键" @mousedown.stop />
                  <input v-model="col.name" class="ds-schema-row__field" placeholder="字段名" @mousedown.stop />
                  <input v-model="col.label" class="ds-schema-row__label" placeholder="标签" @mousedown.stop />
                  <el-select v-model="col.type" size="small" class="ds-schema-row__type" @mousedown.stop>
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
        </div>

        <div class="ds-ai__form">
          <label class="ds-ai__label">💬 描述你的数据需求：</label>
          <el-input
            v-model="aiPrompt"
            type="textarea"
            :rows="4"
            placeholder="例如：用户订单系统，用户可以有多个订单，每个订单包含多个订单项..."
          />
          <el-button
            type="primary"
            class="ds-ai__generate"
            :loading="aiLoading"
            :disabled="!aiPrompt.trim()"
            @click="generateDataModel"
          >
            <NavIcon name="MagicStick" :size="14" /> 🚀 生成数据模型
          </el-button>
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
import { getAILoop, validateDataSetCrudToolStillParams } from '@spark-view/spark-ai'
import { ElMessage, ElMessageBox } from 'element-plus'
import NavIcon from '@/components/NavIcon.vue'
import type { DevState } from './useDevState'
import { DataSetCrudTool } from '@spark-view/spark-data'
import type { DataColumn, TableRelation, ITableMetadata, IDataSetMetadata, IViewMetadata } from '@spark-view/spark-data'

/**
 * 设计器列 — DataColumn + 画布唯一标识
 */
interface DesignerColumn extends DataColumn {
  id: string
}

/**
 * 设计器表 — 严格继承 ITableMetadata，仅添加画布 UI 字段
 */
interface DesignerTable extends Omit<ITableMetadata, 'columns'> {
  /** 画布唯一标识 */
  id: string
  /** 画布 X 坐标 */
  x: number
  /** 画布 Y 坐标 */
  y: number
  /** 列定义（扩展 DataColumn，增加画布 id） */
  columns: DesignerColumn[]
}

/**
 * 设计器关系 — 严格继承 TableRelation，仅添加可视化关系类型
 */
interface DesignerRelation extends TableRelation {
  relationType?: 'one-to-many' | 'one-to-one' | 'many-to-many'
}

interface BlueprintStep {
  action: string
  status: 'pending' | 'running' | 'done'
}

const props = defineProps<{
  state: DevState
}>()

const tables = ref<DesignerTable[]>([])
const relations = ref<DesignerRelation[]>([])
const selectedTableId = ref<string | null>(null)
const expandedTables = ref<Set<string>>(new Set())
const propsExpandedTables = ref<Set<string>>(new Set())
const viewportRef = ref<HTMLElement | null>(null)
const hoveredRelIdx = ref(-1)

// ═══ 关系编辑状态 ═══
const editingRel = ref<(DesignerRelation & { _idx: number }) | null>(null)
const relEditorPos = computed(() => {
  if (editingRel.value === null) return {}
  const idx = editingRel.value._idx
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

function markHistoryChanged(): void {
  historyTick.value += 1
}

function resetHistoryFromDesignerState(): void {
  historyTool.value = DataSetCrudTool.fromJson(buildDataSetMetadataFromDesigner())
  markHistoryChanged()
}

function resetHistoryFromTool(tool: DataSetCrudTool): void {
  historyTool.value = DataSetCrudTool.fromJson(tool.toJson())
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
  layoutForNewTable?: (tableName: string, newIndex: number) => { x: number; y: number },
): void {
  if (!historyTool.value || !isDesignerStateInSyncWithHistory()) {
    resetHistoryFromDesignerState()
  }
  const tool = historyTool.value!
  mutator(tool)
  syncDesignerFromCrudTool(tool, layoutForNewTable)
  markHistoryChanged()
}

function undo() {
  if (!historyTool.value) return
  const ok = historyTool.value.undo()
  if (!ok) return
  syncDesignerFromCrudTool(historyTool.value)
  editingRel.value = null
  selectedTableId.value = null
  markHistoryChanged()
}

function redo() {
  if (!historyTool.value) return
  const ok = historyTool.value.redo()
  if (!ok) return
  syncDesignerFromCrudTool(historyTool.value)
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
  syncDesignerFromCrudTool(tool)
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

const aiPrompt = ref('')
const aiLoading = ref(false)
const aiResponse = ref('')
const blueprint = ref<BlueprintStep[]>([])
const viewDependencies = ref<NonNullable<IDataSetMetadata['viewDependencies']> | undefined>(undefined)

const hasChanges = computed(() => tables.value.length > 0)

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

const loop = computed(() => getAILoop())

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

function normalizeLooseRelation(
  rel: Record<string, unknown>,
  options: {
    allowAliasKeys?: boolean
    defaultParentField?: string
    defaultChildField?: (parentTable: string) => string
    includeAdvancedFields?: boolean
  } = {},
): TableRelation | null {
  const parentTable = (rel['parentTable'] as string | undefined)
    ?? (options.allowAliasKeys ? (rel['from'] as string | undefined) : undefined)
  const childTable = (rel['childTable'] as string | undefined)
    ?? (options.allowAliasKeys ? (rel['to'] as string | undefined) : undefined)

  if (!parentTable || !childTable) return null

  const parentField = (rel['parentField'] as string | undefined)
    ?? (options.allowAliasKeys ? (rel['fromField'] as string | undefined) : undefined)
    ?? options.defaultParentField
  const childField = (rel['childField'] as string | undefined)
    ?? (options.allowAliasKeys ? (rel['toField'] as string | undefined) : undefined)
    ?? options.defaultChildField?.(parentTable)

  const normalized: TableRelation = {
    parentTable,
    childTable,
    ...(parentField !== undefined ? { parentField } : {}),
    ...(childField !== undefined ? { childField } : {}),
  }

  if (!options.includeAdvancedFields) return normalized

  return {
    ...normalized,
    ...(typeof rel['relationName'] === 'string' ? { relationName: rel['relationName'] } : {}),
    ...(rel['condition'] && typeof rel['condition'] === 'object' ? { condition: rel['condition'] as Record<string, unknown> } : {}),
    ...(typeof rel['cascadeUpdate'] === 'boolean' ? { cascadeUpdate: rel['cascadeUpdate'] } : {}),
    ...(typeof rel['cascadeDelete'] === 'boolean' ? { cascadeDelete: rel['cascadeDelete'] } : {}),
  }
}

function normalizeAndValidateRelationForCreate(
  rel: Record<string, unknown>,
  options: {
    allowAliasKeys?: boolean
    defaultParentField?: string
    defaultChildField?: (parentTable: string) => string
  } = {},
): TableRelation | null {
  const normalized = normalizeLooseRelation(rel, {
    ...(options.allowAliasKeys !== undefined ? { allowAliasKeys: options.allowAliasKeys } : {}),
    ...(options.defaultParentField !== undefined ? { defaultParentField: options.defaultParentField } : {}),
    ...(options.defaultChildField !== undefined ? { defaultChildField: options.defaultChildField } : {}),
  })
  if (!normalized) return null

  assertDatasetToolParams('datasetTool.createRelation', {
    parentTable: normalized.parentTable,
    childTable: normalized.childTable,
    parentField: normalized.parentField,
    childField: normalized.childField,
  })
  return normalized
}

function normalizeColumnsFromLoose(
  rawColumns: unknown,
  fallbackPrimaryKey = true,
): DataColumn[] {
  const cols = (Array.isArray(rawColumns) ? rawColumns : []) as Array<Record<string, unknown>>
  const normalized = cols.map((c) => ({
    name: (c['name'] ?? c['field'] ?? '') as string,
    label: (c['label'] ?? '') as string,
    type: (c['type'] ?? 'string') as DesignerColumn['type'],
    isPrimaryKey: Boolean(c['isPrimaryKey']),
  }))

  if (normalized.length > 0) return normalized
  if (!fallbackPrimaryKey) return []
  return [{ name: 'id', label: 'ID', type: 'number', isPrimaryKey: true }]
}

function normalizeViewsFromLoose(rawViews: unknown): { default: IViewMetadata } & Record<string, IViewMetadata> {
  const views = (asRecord(rawViews) as Record<string, IViewMetadata> | null) ?? { default: { rows: [] } }
  const normalized = views as { default: IViewMetadata } & Record<string, IViewMetadata>
  if (!normalized['default']) normalized['default'] = { rows: [] }
  return normalized
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function assertDatasetToolParams(action: string, params: unknown): void {
  const validationError = validateDataSetCrudToolStillParams(action, params)
  if (validationError) {
    throw new Error(`[${action}] ${validationError}`)
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
  try {
    const raw = JSON.parse(props.state.editFiles['pagedata.json'] ?? '{}') as Record<string, unknown>
    if (typeof raw['dataSetName'] === 'string') return raw['dataSetName']
    if (raw['dataset'] && typeof raw['dataset'] === 'object') {
      const wrapped = raw['dataset'] as Record<string, unknown>
      if (typeof wrapped['dataSetName'] === 'string') return wrapped['dataSetName']
    }
  } catch {
    // ignore
  }
  return 'PageDataSet'
}

function buildDataSetMetadataFromDesigner(): IDataSetMetadata {
  const tablesObj: Record<string, ITableMetadata> = {}
  const tablePositions: Record<string, { x: number; y: number }> = {}
  for (const table of tables.value) {
    const { id: _id, x: _x, y: _y, columns: designerCols, ...tableRest } = table
    const columns: DataColumn[] = designerCols.map(({ id: _cid, ...col }) => col)
    tablesObj[table.tableName] = { ...tableRest, columns }
    tablePositions[table.tableName] = { x: table.x, y: table.y }
  }

  return {
    dataSetName: readCurrentDataSetName(),
    tables: tablesObj,
    tableRelations: relations.value.map(normalizeRelation),
    ...(viewDependencies.value ? { viewDependencies: viewDependencies.value } : {}),
    layout: { tablePositions },
  }
}

function syncDesignerFromCrudTool(
  tool: DataSetCrudTool,
  layoutForNewTable?: (tableName: string, newIndex: number) => { x: number; y: number },
): void {
  const metadata = tool.toJson()
  const oldByName = new Map(tables.value.map(table => [table.tableName, table]))
  const persistedPositions = metadata.layout?.tablePositions
  let newTableCount = 0

  tables.value = Object.entries(metadata.tables).map(([tableName, tableConfig], idx) => {
    const oldTable = oldByName.get(tableName)
    const oldColumnIdMap = new Map((oldTable?.columns ?? []).map(col => [col.name, col.id]))
    const defaultLayout = {
      x: 50 + (idx % 3) * 220,
      y: 50 + Math.floor(idx / 3) * 200,
    }
    const newLayout = layoutForNewTable?.(tableName, newTableCount) ?? defaultLayout
    const persistedLayout = persistedPositions?.[tableName]
    if (!oldTable) newTableCount += 1

    return {
      id: oldTable?.id ?? generateId(),
      x: persistedLayout?.x ?? oldTable?.x ?? newLayout.x,
      y: persistedLayout?.y ?? oldTable?.y ?? newLayout.y,
      ...tableConfig,
      columns: tableConfig.columns.map((column) => ({
        id: oldColumnIdMap.get(column.name) ?? generateId(),
        ...column,
      })),
    }
  })

  relations.value = (metadata.tableRelations ?? []).map((rel) => ({
    ...rel,
    relationType: 'one-to-many',
  }))

  viewDependencies.value = metadata.viewDependencies
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
  if (editingRel.value?._idx === idx) editingRel.value = null
}

function editRelation(idx: number) {
  const rel = relations.value[idx]
  if (!rel) return
  editingRel.value = { ...rel, _idx: idx }
}

function applyRelationEdit() {
  if (!editingRel.value) return
  const { _idx, ...relData } = editingRel.value
  const original = relations.value[_idx]
  if (!original) {
    editingRel.value = null
    return
  }
  applyMutationWithHistory((tool) => {
    tool.updateRelation({
      selector: buildRelationSelector(original),
      updates: normalizeRelation(relData),
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
  const idx = editingRel.value._idx
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
  tables.value.forEach((t, i) => {
    t.x = 40 + (i % cols) * 320
    t.y = 40 + Math.floor(i / cols) * 280
  })
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
    table.x = Math.max(0, dragState.value.origX + dx)
    table.y = Math.max(0, dragState.value.origY + dy)
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
})

// ═══ pagedata.json 互转 ═══

function parseFromPageData(silent = false) {
  try {
    const content = props.state.editFiles['pagedata.json'] ?? '{}'
    let data = JSON.parse(content) as Record<string, unknown>
    
    // 兼容 { dataset: { ... } } 包装格式
    if (data['dataset'] && typeof data['dataset'] === 'object' && !data['tables']) {
      data = data['dataset'] as Record<string, unknown>
    }
    
    let dataTables = data['tables'] as Record<string, Record<string, unknown>> | undefined
    
    // 兼容 legacy flat 格式：顶层 key 直接是表名（值为对象且含 columns 或 views）
    if (!dataTables || typeof dataTables !== 'object') {
      const inferredTables: Record<string, Record<string, unknown>> = {}
      for (const [key, val] of Object.entries(data)) {
        if (key === 'dataSetName' || key === 'tableRelations' || key === 'viewDependencies' || key === 'schemaVersion' || key === 'pageId' || key === 'version') continue
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const obj = val as Record<string, unknown>
          if (obj['columns'] || obj['views'] || obj['tableName']) {
            inferredTables[key] = obj
          }
        }
      }
      if (Object.keys(inferredTables).length > 0) {
        dataTables = inferredTables
      }
    }
    
    if (!dataTables || typeof dataTables !== 'object') {
      if (!silent) ElMessage.warning('pagedata.json 中没有找到 tables 定义')
      return
    }
    
    const normalizedTables: Record<string, ITableMetadata> = {}
    for (const [name, config] of Object.entries(dataTables)) {
      const columns = normalizeColumnsFromLoose(config['columns'])
      const views = normalizeViewsFromLoose(config['views'])

      normalizedTables[name] = {
        tableName: name,
        columns,
        views,
        ...(config['api'] !== undefined ? { api: config['api'] as ITableMetadata['api'] } : {}),
        ...(config['resourceType'] !== undefined ? { resourceType: config['resourceType'] as NonNullable<ITableMetadata['resourceType']> } : {}),
        ...(config['resourceId'] !== undefined ? { resourceId: config['resourceId'] as NonNullable<ITableMetadata['resourceId']> } : {}),
        ...(config['businessCategory'] !== undefined ? { businessCategory: config['businessCategory'] as NonNullable<ITableMetadata['businessCategory']> } : {}),
        ...(config['crudConfig'] !== undefined ? { crudConfig: config['crudConfig'] as ITableMetadata['crudConfig'] } : {}),
      }
    }

    const rawRelations = data['tableRelations'] as Array<Record<string, unknown>> | undefined
    const normalizedRelations: TableRelation[] = Array.isArray(rawRelations)
      ? rawRelations
        .map(rel => normalizeLooseRelation(rel, { includeAdvancedFields: true }))
        .filter((rel): rel is TableRelation => rel !== null)
      : []

    const normalizedDataSet: IDataSetMetadata = {
      dataSetName: (data['dataSetName'] as string | undefined) ?? 'PageDataSet',
      tables: normalizedTables,
      tableRelations: normalizedRelations,
      ...(Array.isArray(data['viewDependencies'])
        ? { viewDependencies: data['viewDependencies'] as NonNullable<IDataSetMetadata['viewDependencies']> }
        : {}),
      ...(typeof data['pageId'] === 'string' ? { pageId: data['pageId'] } : {}),
    }

    const tool = DataSetCrudTool.fromJson(normalizedDataSet)
    syncDesignerFromCrudTool(tool)
    resetHistoryFromTool(tool)
    
    if (!silent) ElMessage.success(`已加载 ${tables.value.length} 个表`)
  } catch {
    if (!silent) ElMessage.error('解析 pagedata.json 失败')
  }
}

function exportToPageData() {
  // 先读取现有 pagedata.json 以保留 views 里的 rows 等数据
  let existing: Record<string, unknown> = {}
  let isDatasetWrapped = false
  try {
    const raw = JSON.parse(props.state.editFiles['pagedata.json'] ?? '{}') as Record<string, unknown>
    // 兼容 { dataset: { ... } } 包装格式
    if (raw['dataset'] && typeof raw['dataset'] === 'object' && !raw['tables']) {
      existing = raw['dataset'] as Record<string, unknown>
      isDatasetWrapped = true
    } else {
      existing = raw
    }
  } catch { /* ignore */ }

  const tool = DataSetCrudTool.fromJson(buildDataSetMetadataFromDesigner())
  const toolJson = tool.toJson()

  const pageData: IDataSetMetadata = {
    ...toolJson,
    dataSetName: (existing['dataSetName'] as string | undefined) ?? toolJson.dataSetName,
    ...(existing['pageId'] ? { pageId: existing['pageId'] as string } : {}),
    ...(Array.isArray(existing['viewDependencies'])
      ? { viewDependencies: existing['viewDependencies'] as NonNullable<IDataSetMetadata['viewDependencies']> }
      : toolJson.viewDependencies !== undefined
        ? { viewDependencies: toolJson.viewDependencies }
        : {}),
  }
  
  // 保持原有格式输出
  const output = isDatasetWrapped ? { dataset: pageData } : pageData
  const newContent = JSON.stringify(output, null, 2)
  props.state.updatePageFile('pagedata.json', newContent)
  ElMessage.success('已导出到 pagedata.json')
}

// ═══ AI 生成 ═══

async function generateDataModel() {
  const loopInstance = loop.value
  if (!loopInstance || !aiPrompt.value.trim()) return
  
  aiLoading.value = true
  aiResponse.value = ''
  blueprint.value = [
    { action: 'dataset.init', status: 'pending' },
    { action: 'datatable.create', status: 'pending' },
    { action: 'datatable.addColumns', status: 'pending' },
    { action: 'relation.add', status: 'pending' },
  ]
  
  try {
    const prompt = `你是 SPARK 数据模型设计专家。根据以下需求设计数据表结构：

需求描述：
${aiPrompt.value}

请按以下 SPARK pagedata.json 格式返回数据模型设计：
\`\`\`json
{
  "dataSetName": "PageDataSet",
  "tableRelations": [
    { "parentTable": "主表名", "childTable": "从表名", "parentField": "id", "childField": "主表名Id" }
  ],
  "tables": {
    "表名": {
      "tableName": "表名",
      "columns": [
        { "name": "字段名", "type": "string|number|boolean|date|datetime", "label": "中文标签", "isPrimaryKey": true }
      ],
      "views": {
        "default": { "rows": [] }
      }
    }
  }
}
\`\`\`

规则：
- columns 用 name（非 field），用 isPrimaryKey（非 isPrimary）
- 每个表必须有 tableName 和 views.default
- 每个字段都要有 label（中文标签）
- 主键字段设 isPrimaryKey: true
只返回 JSON，不要其他解释。`

    // 模拟蓝图进度
    blueprint.value[0]!.status = 'running'
    await new Promise((r) => setTimeout(r, 300))
    blueprint.value[0]!.status = 'done'
    blueprint.value[1]!.status = 'running'
    
    let fullResponse = ''
    const pageId = props.state.activePageId.value || 'default'
    await loopInstance.generateStream(pageId, prompt, {
      onDelta(text) { fullResponse += text },
      onReasoning() {},
      onPhase() {},
    })
    
    blueprint.value[1]!.status = 'done'
    blueprint.value[2]!.status = 'running'
    
    // 解析 JSON
    const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch && jsonMatch[1]) {
      const modelData = JSON.parse(jsonMatch[1]) as Record<string, unknown>
      
      const modelTables = (modelData['tables'] ?? {}) as Record<string, Record<string, unknown>>
      const normalizedTables: Record<string, ITableMetadata> = {}
      for (const [name, tableConfig] of Object.entries(modelTables)) {
        const columns = normalizeColumnsFromLoose(tableConfig['columns'])

        const normalizedTable: ITableMetadata = {
          tableName: name,
          columns,
          views: normalizeViewsFromLoose(undefined),
        }

        // 与 datasetTool 能力调用共用同一参数校验，避免设计器链路与 stills 规则漂移。
        assertDatasetToolParams('datasetTool.createTable', {
          tableName: normalizedTable.tableName,
          columns: normalizedTable.columns,
          views: normalizedTable.views,
        })

        normalizedTables[name] = normalizedTable
      }
      
      blueprint.value[2]!.status = 'done'
      blueprint.value[3]!.status = 'running'
      
      // 应用关联 — 直接使用 canonical TableRelation 字段名
      const modelRelations = (modelData['tableRelations'] ?? modelData['relations'] ?? []) as Array<Record<string, string>>
      const normalizedRelations: TableRelation[] = []
      for (const rel of modelRelations) {
        const normalizedRelation = normalizeAndValidateRelationForCreate(rel, {
          allowAliasKeys: true,
          defaultParentField: 'id',
          defaultChildField: (parentTable) => `${parentTable}_id`,
        })
        if (!normalizedRelation) continue
        normalizedRelations.push(normalizedRelation)
      }

      const tool = DataSetCrudTool.fromJson({
        dataSetName: readCurrentDataSetName(),
        tables: normalizedTables,
        tableRelations: normalizedRelations,
      })
      syncDesignerFromCrudTool(tool)
      resetHistoryFromTool(tool)
      
      blueprint.value[3]!.status = 'done'
      aiResponse.value = `已成功生成 ${tables.value.length} 个表和 ${relations.value.length} 个关联关系。`
    } else {
      aiResponse.value = fullResponse
    }
  } catch (err) {
    aiResponse.value = `生成失败: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    aiLoading.value = false
  }
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

.ds-ai__form {
  padding: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.ds-ai__label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #334155;
}

.ds-ai__generate {
  width: 100%;
  margin-top: 12px;
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
