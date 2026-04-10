<template>
  <div class="skill-catalog">
    <div class="skill-catalog__header">
      <h2>SPARK 组件配置目录</h2>
      <div class="skill-catalog__stats">
        <el-tag>{{ skills.length }} 个组件</el-tag>
        <el-tag type="success">{{ skillsWithProps.length }} 有 Props</el-tag>
        <el-tag type="info">{{ totalProps }} 个属性</el-tag>
        <el-tag
          :type="showTypeDict ? 'primary' : 'info'"
          effect="plain"
          class="skill-catalog__dict-toggle"
          @click="showTypeDict = !showTypeDict"
        >📖 类型字典 ({{ Object.keys(TYPE_DICT).length }})</el-tag>
      </div>
      <div class="skill-catalog__controls">
        <el-input
          v-model="searchText"
          placeholder="搜索组件名或描述…"
          :prefix-icon="Search"
          clearable
          style="width: 260px"
        />
        <el-select v-model="categoryFilter" clearable placeholder="分类筛选" style="width: 140px">
          <el-option label="容器" value="container" />
          <el-option label="字段" value="field" />
          <el-option label="显示" value="display" />
          <el-option label="布局" value="layout" />
          <el-option label="其他" value="other" />
        </el-select>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="card">卡片</el-radio-button>
          <el-radio-button value="table">表格</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 类型字典面板 -->
    <div v-if="showTypeDict" class="type-dict">
      <div class="type-dict__header">
        <h3>类型字典</h3>
        <el-input v-model="typeDictSearch" placeholder="搜索类型…" clearable size="small" style="width: 200px" />
      </div>
      <div class="type-dict__grid">
        <div
          v-for="entry in filteredTypeDict"
          :key="entry.name"
          :id="'type-' + extractTypeName(entry.name)"
          :class="['type-dict__entry', { 'type-dict__entry--highlight': highlightedType === extractTypeName(entry.name) }]"
        >
          <div class="type-dict__name"><code>{{ entry.name }}</code></div>
          <pre class="type-dict__def"><code>{{ entry.definition }}</code></pre>
          <div v-if="entry.fields" class="type-dict__fields">
            <table class="type-dict__table">
              <tr v-for="f in entry.fields" :key="f.name">
                <td><code>{{ f.name }}</code></td>
                <td>
                  <code
                    :class="{ 'type-link': isKnownType(f.type) }"
                    @click="isKnownType(f.type) && scrollToType(extractTypeName(f.type))"
                  >{{ f.type }}</code>
                </td>
                <td class="type-dict__field-desc">{{ f.desc }}</td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- 卡片视图 -->
    <div v-if="viewMode === 'card'" class="skill-catalog__grid">
      <div
        v-for="skill in filteredSkills"
        :key="skill.type"
        :class="['skill-card', { 'skill-card--active': selectedType === skill.type }]"
        @click="selectedType = selectedType === skill.type ? '' : skill.type"
      >
        <div class="skill-card__header">
          <code class="skill-card__type">{{ skill.type }}</code>
          <el-tag v-if="skill.props?.length" size="small" type="info">{{ skill.props.length }} props</el-tag>
        </div>
        <p v-if="skill.description" class="skill-card__desc">{{ skill.description }}</p>
        <div v-if="skill.provides.length || skill.consumes.length" class="skill-card__caps">
          <el-tag v-for="p in skill.provides" :key="'p-'+p" size="small" type="success" effect="plain">↑ {{ p }}</el-tag>
          <el-tag v-for="c in skill.consumes" :key="'c-'+c" size="small" type="warning" effect="plain">↓ {{ c }}</el-tag>
        </div>

        <!-- 展开的 Props 详情 -->
        <div v-if="selectedType === skill.type && skill.props?.length" class="skill-card__props">
          <PropsTable :props="skill.props" @type-click="handleTypeClick" />

          <div v-if="skill.example" class="skill-card__example">
            <strong>配置示例：</strong>
            <pre><code>{{ formatJson(skill.example) }}</code></pre>
          </div>
        </div>
      </div>
    </div>

    <!-- 表格视图 -->
    <el-table
      v-else
      :data="filteredSkills"
      stripe
      border
      highlight-current-row
      row-key="type"
      @current-change="(row: SkillMeta | null) => selectedType = row?.type ?? ''"
      style="width: 100%"
    >
      <el-table-column prop="type" label="组件" width="180" sortable>
        <template #default="{ row }">
          <code>{{ row.type }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="300" show-overflow-tooltip />
      <el-table-column label="Props" width="80" align="center" sortable :sort-method="sortByProps">
        <template #default="{ row }">
          <el-tag v-if="row.props?.length" size="small">{{ row.props.length }}</el-tag>
          <span v-else style="color: #c0c4cc">—</span>
        </template>
      </el-table-column>
      <el-table-column label="能力" width="240">
        <template #default="{ row }">
          <el-tag v-for="p in row.provides" :key="'p-'+p" size="small" type="success" effect="plain" style="margin: 1px 2px">↑{{ p }}</el-tag>
          <el-tag v-for="c in row.consumes" :key="'c-'+c" size="small" type="warning" effect="plain" style="margin: 1px 2px">↓{{ c }}</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <!-- 表格视图下的详情面板 -->
    <div v-if="viewMode === 'table' && selectedSkill?.props?.length" class="skill-catalog__detail">
      <h3><code>{{ selectedSkill.type }}</code> Props</h3>
      <PropsTable :props="selectedSkill.props" @type-click="handleTypeClick" />
      <div v-if="selectedSkill.example" class="skill-card__example">
        <strong>配置示例：</strong>
        <pre><code>{{ formatJson(selectedSkill.example) }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, defineComponent, h } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { skillCatalog, type SkillMeta, type PropMeta } from 'virtual:spark-skill-catalog'

// ── 类型字典 ──────────────────────────────────────────────────────────────

interface TypeDictEntry {
  name: string
  definition: string
  fields?: Array<{ name: string; type: string; desc: string }>
}

const TYPE_DICT: Record<string, TypeDictEntry> = {
  'DockProp': {
    name: 'DockProp<T>',
    definition: 'T | Record<string, unknown> | false | null',
    fields: [
      { name: '完整节点（T）', type: 'SparkNode', desc: '传完整 dock 节点对象，如 { type: "r-toolbar", children: [...] }' },
      { name: '简写 props', type: 'Record<string, unknown>', desc: '只传 props 部分（如 { position: "top" }），框架自动包装为完整节点' },
      { name: 'false | null', type: 'literal', desc: '显式禁用该 dock 区域（不渲染）' },
    ],
  },
  'DockToolbarNode': {
    name: 'DockToolbarNode',
    definition: 'interface extends SparkNode { type: "r-toolbar" }',
    fields: [
      { name: 'type', type: '"r-toolbar"', desc: '固定值' },
      { name: 'props.position', type: 'ToolbarPosition', desc: '工具栏位置' },
      { name: 'props.class', type: 'string', desc: '自定义 CSS 类名' },
      { name: 'children', type: 'SparkNode[]', desc: '工具栏内按钮/组件列表' },
    ],
  },
  'DockFilterNode': {
    name: 'DockFilterNode',
    definition: 'interface extends SparkNode { type: "r-filter" }',
    fields: [
      { name: 'type', type: '"r-filter"', desc: '固定值' },
      { name: 'props.columns', type: 'Array<string | DockFilterItem>', desc: '筛选列配置' },
      { name: 'props.collapsible', type: 'boolean', desc: '是否可折叠' },
      { name: 'props.gridColumns', type: 'number', desc: '网格列数（默认 24）' },
      { name: 'children', type: 'SparkNode[]', desc: '筛选字段子节点' },
    ],
  },
  'DockActionsNode': {
    name: 'DockActionsNode',
    definition: 'interface extends SparkNode { type: "r-actions" }',
    fields: [
      { name: 'type', type: '"r-actions"', desc: '固定值' },
      { name: 'props.position', type: 'LateralActionPosition', desc: '行操作列位置' },
      { name: 'props.label', type: 'string', desc: '列标题（默认"操作"）' },
      { name: 'props.width', type: 'number | string', desc: '列宽（默认 160）' },
      { name: 'props.fixed', type: 'boolean | "left" | "right"', desc: '固定列' },
      { name: 'children', type: 'SparkNode[]', desc: '行操作按钮列表' },
    ],
  },
  'DockEditorNode': {
    name: 'DockEditorNode',
    definition: 'interface extends SparkNode { type: "r-editor" }',
    fields: [
      { name: 'type', type: '"r-editor"', desc: '固定值' },
      { name: 'children', type: 'SparkNode[]', desc: '编辑区子节点' },
    ],
  },
  'SparkNode': {
    name: 'SparkNode',
    definition: '{ type: string; props?: Record<string, unknown>; children?: SparkNode[] }',
    fields: [
      { name: 'type', type: 'string', desc: '组件类型名（kebab-case）' },
      { name: 'props', type: 'Record<string, unknown>', desc: '组件属性' },
      { name: 'children', type: 'SparkNode[]', desc: '子节点列表' },
    ],
  },
  'ToolbarPosition': {
    name: 'ToolbarPosition',
    definition: '"top" | "bottom" | "left" | "right"',
  },
  'LateralActionPosition': {
    name: 'LateralActionPosition',
    definition: '"left" | "right"',
  },
  'RowClickHandler': {
    name: 'RowClickHandler',
    definition: '(row: IDataRow, column: unknown, event: Event | undefined, control: InteractionControl) => void | Promise<void>',
    fields: [
      { name: 'row', type: 'IDataRow', desc: '被点击的行数据' },
      { name: 'column', type: 'unknown', desc: '列信息' },
      { name: 'event', type: 'Event | undefined', desc: '原生事件' },
      { name: 'control', type: 'InteractionControl', desc: '调用 control.cancel() 阻止默认行为' },
    ],
  },
  'RowSelectionHandler': {
    name: 'RowSelectionHandler',
    definition: '(selection: IDataRow[], control: InteractionControl) => void | Promise<void>',
    fields: [
      { name: 'selection', type: 'IDataRow[]', desc: '当前选中行数组' },
      { name: 'control', type: 'InteractionControl', desc: '调用 control.cancel() 阻止默认行为' },
    ],
  },
  'CurrentRowChangeHandler': {
    name: 'CurrentRowChangeHandler',
    definition: '(currentRow: IDataRow | null, oldRow: IDataRow | null | undefined, control: InteractionControl) => void | Promise<void>',
    fields: [
      { name: 'currentRow', type: 'IDataRow | null', desc: '新的当前行' },
      { name: 'oldRow', type: 'IDataRow | null', desc: '旧的当前行' },
      { name: 'control', type: 'InteractionControl', desc: '调用 control.cancel() 阻止默认行为' },
    ],
  },
  'AddRowHandler': {
    name: 'AddRowHandler',
    definition: '(partialRow: Partial<IDataRow>, control: InteractionControl) => void | Promise<void>',
  },
  'EditRowHandler': {
    name: 'EditRowHandler',
    definition: '(rowId: string | number, partialRow: Partial<IDataRow>, control: InteractionControl) => void | Promise<void>',
  },
  'RemoveRowHandler': {
    name: 'RemoveRowHandler',
    definition: '(rowId: string | number, control: InteractionControl) => void | Promise<void>',
  },
  'TreeEventHandler': {
    name: 'TreeEventHandler',
    definition: '(data: TreeNode, node: ElTreeNode, component: ElTreeComponent, control: CancellableControl) => void | Promise<void>',
    fields: [
      { name: 'data', type: 'TreeNode', desc: '节点数据对象' },
      { name: 'node', type: 'ElTreeNode', desc: 'el-tree 内部节点（level, expanded 等）' },
      { name: 'component', type: 'ElTreeComponent', desc: 'el-tree 组件实例' },
      { name: 'control', type: 'CancellableControl', desc: '调用 control.cancel() 阻止默认行为' },
    ],
  },
  'InteractionControl': {
    name: 'InteractionControl',
    definition: '{ cancel(): void }',
    fields: [
      { name: 'cancel()', type: 'void', desc: '调用后阻止框架默认处理（如自动选中、自动加载）' },
    ],
  },
  'IDataRow': {
    name: 'IDataRow',
    definition: 'Record<string, unknown> & { _id?: string | number }',
    fields: [
      { name: '_id', type: 'string | number', desc: '行标识（框架自动生成或从数据主键取）' },
      { name: '[field]', type: 'unknown', desc: '任意字段值（由 DataTable columns 定义）' },
    ],
  },
  'CollapseValue': {
    name: 'CollapseValue',
    definition: 'string | number | Array<string | number>',
  },
}

const showTypeDict = ref(false)
const typeDictSearch = ref('')
const highlightedType = ref('')

const filteredTypeDict = computed(() => {
  const entries = Object.values(TYPE_DICT)
  if (!typeDictSearch.value) return entries
  const q = typeDictSearch.value.toLowerCase()
  return entries.filter(e =>
    e.name.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q),
  )
})

/** 从泛型类型中提取基础类型名: DockProp<DockToolbarNode> → DockProp */
function extractTypeName(typeStr: string): string {
  return typeStr.replace(/<.*>$/, '').trim()
}

/** 判断类型名是否在字典中 */
function isKnownType(typeStr: string): boolean {
  const base = extractTypeName(typeStr)
  return base in TYPE_DICT
}

/** 获取类型的字典条目（用于 tooltip） */
function getTypeDef(typeStr: string): string | undefined {
  const base = extractTypeName(typeStr)
  return TYPE_DICT[base]?.definition
}

/** 从复合类型字符串中提取所有可查的类型名 */
function extractClickableTypes(typeStr: string): Array<{ text: string; clickable: boolean; typeName: string }> {
  const parts: Array<{ text: string; clickable: boolean; typeName: string }> = []
  const regex = /([A-Z]\w*(?:<[^>]+>)?)/g
  let last = 0
  let match: RegExpExecArray | null
  match = regex.exec(typeStr)
  while (match !== null) {
    const fullMatch = match[1] ?? ''
    if (match.index > last) {
      parts.push({ text: typeStr.slice(last, match.index), clickable: false, typeName: '' })
    }
    const baseName = extractTypeName(fullMatch)
    const known = baseName in TYPE_DICT
    parts.push({ text: fullMatch, clickable: known, typeName: known ? baseName : '' })
    last = match.index + fullMatch.length
    match = regex.exec(typeStr)
  }
  if (last < typeStr.length) {
    parts.push({ text: typeStr.slice(last), clickable: false, typeName: '' })
  }
  return parts
}

async function scrollToType(typeName: string) {
  showTypeDict.value = true
  highlightedType.value = typeName
  await nextTick()
  const el = document.getElementById('type-' + typeName)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => { highlightedType.value = '' }, 2000)
}

function handleTypeClick(typeName: string) {
  scrollToType(typeName)
}

// ── PropsTable 内联组件（类型可点击） ─────────────────────────────────────

const PropsTable = defineComponent({
  props: {
    props: { type: Array as () => PropMeta[], required: true },
  },
  emits: ['type-click'],
  setup(p, { emit }) {
    return () => h('table', { class: 'props-table' }, [
      h('thead', [h('tr', [
        h('th', '属性'), h('th', '类型'), h('th', '必填'), h('th', '默认值'), h('th', '说明'),
      ])]),
      h('tbody', p.props.map(prop =>
        h('tr', {
          key: prop.name,
          class: { 'props-table__event': /^on[A-Z]/.test(prop.name) },
        }, [
          h('td', [h('code', prop.name)]),
          h('td', renderType(prop.type, emit)),
          h('td', prop.required ? '✓' : ''),
          h('td', prop.default ? [h('code', prop.default)] : []),
          h('td', prop.description ?? ''),
        ]),
      )),
    ])
  },
})

function renderType(typeStr: string, emit: (event: 'type-click', name: string) => void) {
  const parts = extractClickableTypes(typeStr)
  if (parts.length === 1 && parts[0] && !parts[0].clickable) {
    return [h('code', { class: 'props-table__type' }, typeStr)]
  }
  return parts.map((part, i) => {
    if (part.clickable) {
      return h('code', {
        key: i,
        class: 'props-table__type type-link',
        title: `点击查看 ${part.typeName} 定义` + (getTypeDef(part.typeName) ? `\n= ${getTypeDef(part.typeName)}` : ''),
        onClick: (e: Event) => { e.stopPropagation(); emit('type-click', part.typeName) },
      }, part.text)
    }
    return h('code', { key: i, class: 'props-table__type' }, part.text)
  })
}

// ── 组件列表逻辑 ──────────────────────────────────────────────────────────

const searchText = ref('')
const categoryFilter = ref('')
const selectedType = ref('')
const viewMode = ref<'card' | 'table'>('card')

const skills = computed(() => [...skillCatalog].sort((a, b) => a.type.localeCompare(b.type)))

const skillsWithProps = computed(() => skills.value.filter(s => s.props?.length))

const totalProps = computed(() =>
  skills.value.reduce((sum, s) => sum + (s.props?.length ?? 0), 0),
)

function categorize(type: string): string {
  if (/^r-(table|form|detail|tree|dialog|drawer)/.test(type)) return 'container'
  if (/^r-(text|number|select|date|switch|checkbox|radio|upload|cascader)/.test(type)) return 'field'
  if (/^(display-|el-statistic|el-progress|el-tag)/.test(type)) return 'display'
  if (/^r-(tabs|tab-pane|collapse|steps|section|grid|toolbar|filter|actions|footer|header|sidebar)/.test(type)) return 'layout'
  return 'other'
}

const filteredSkills = computed(() => {
  let list = skills.value
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    list = list.filter(
      s => s.type.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q),
    )
  }
  if (categoryFilter.value) {
    list = list.filter(s => categorize(s.type) === categoryFilter.value)
  }
  return list
})

const selectedSkill = computed(() =>
  selectedType.value ? skills.value.find(s => s.type === selectedType.value) : undefined,
)

function sortByProps(a: SkillMeta, b: SkillMeta): number {
  return (a.props?.length ?? 0) - (b.props?.length ?? 0)
}

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}
</script>

<style scoped>
.skill-catalog {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.skill-catalog__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.skill-catalog__header h2 {
  margin: 0;
  font-size: 20px;
}

.skill-catalog__stats {
  display: flex;
  gap: 8px;
}

.skill-catalog__dict-toggle {
  cursor: pointer;
}

.skill-catalog__controls {
  display: flex;
  gap: 10px;
  margin-left: auto;
  align-items: center;
}

/* ── 类型字典 ── */

.type-dict {
  margin-bottom: 20px;
  border: 1px solid var(--el-color-primary-light-7, #c6e2ff);
  border-radius: 8px;
  padding: 16px;
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.type-dict__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.type-dict__header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--el-color-primary, #409eff);
}

.type-dict__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 10px;
}

.type-dict__entry {
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 6px;
  padding: 10px 12px;
  transition: border-color 0.3s, box-shadow 0.3s;
}

.type-dict__entry--highlight {
  border-color: var(--el-color-primary, #409eff);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7, #c6e2ff);
}

.type-dict__name code {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-color-primary, #409eff);
}

.type-dict__def {
  margin: 6px 0;
  padding: 6px 10px;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.type-dict__fields {
  margin-top: 6px;
}

.type-dict__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.type-dict__table td {
  padding: 3px 6px;
  border-bottom: 1px solid var(--el-border-color-extra-light, #f0f2f5);
  vertical-align: top;
}

.type-dict__table td:first-child code {
  color: var(--el-text-color-primary, #303133);
  font-weight: 500;
}

.type-dict__table td:nth-child(2) code {
  color: var(--el-color-success, #67c23a);
}

.type-dict__field-desc {
  color: var(--el-text-color-secondary, #909399);
}

/* ── 组件列表 ── */

.skill-catalog__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 12px;
}

.skill-card {
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 8px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: var(--el-bg-color, #fff);
}

.skill-card:hover {
  border-color: var(--el-color-primary-light-5, #a0cfff);
}

.skill-card--active {
  border-color: var(--el-color-primary, #409eff);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-7, #c6e2ff);
}

.skill-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.skill-card__type {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-color-primary, #409eff);
}

.skill-card__desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-text-color-regular, #606266);
  line-height: 1.5;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skill-card--active .skill-card__desc {
  line-clamp: unset;
  -webkit-line-clamp: unset;
  overflow: visible;
}

.skill-card__caps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.skill-card__props {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-extra-light, #f0f2f5);
}

.skill-card__example {
  margin-top: 10px;
}

.skill-card__example pre {
  background: var(--el-fill-color-lighter, #f5f7fa);
  border-radius: 4px;
  padding: 10px;
  font-size: 12px;
  overflow-x: auto;
  margin: 6px 0 0;
}

/* ── Props 表格 ── */

:deep(.props-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

:deep(.props-table th),
:deep(.props-table td) {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-extra-light, #f0f2f5);
}

:deep(.props-table th) {
  font-weight: 600;
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
  white-space: nowrap;
}

:deep(.props-table code) {
  font-size: 12px;
}

:deep(.props-table__type) {
  color: var(--el-color-success, #67c23a);
}

:deep(.type-link) {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 3px;
}

:deep(.type-link:hover) {
  color: var(--el-color-primary, #409eff);
}

:deep(.props-table__event) {
  background: var(--el-fill-color-lighter, #f5f7fa);
}

:deep(.props-table__event td:first-child code) {
  color: var(--el-color-warning, #e6a23c);
}

.skill-catalog__detail {
  margin-top: 16px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 8px;
  padding: 16px;
}

.skill-catalog__detail h3 {
  margin: 0 0 12px;
  font-size: 16px;
}
</style>
