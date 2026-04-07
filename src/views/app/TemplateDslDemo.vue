<template>
  <div class="template-dsl-demo">
    <header class="template-dsl-demo__hero">
      <div>
        <p class="template-dsl-demo__eyebrow">SPARK Demo</p>
        <h1>Vue Template DSL 页面编排演示</h1>
        <p class="template-dsl-demo__summary">
          这个页面直接使用 Vue DSL 宿主组件编排页面结构，
          用 named slot 直接生成 props.toolbar / props.actions / props.tail 这类结构化 dock，
          验证 DSL 写法已经和当前运行时输入保持同构。
        </p>
      </div>

      <div class="template-dsl-demo__meta">
        <div class="template-dsl-demo__meta-item">
          <span class="template-dsl-demo__meta-label">编写层</span>
          <strong>Vue Template DSL</strong>
        </div>
        <div class="template-dsl-demo__meta-item">
          <span class="template-dsl-demo__meta-label">Dock 模型</span>
          <strong>named slot → structured dock</strong>
        </div>
        <div class="template-dsl-demo__meta-item">
          <span class="template-dsl-demo__meta-label">运行时</span>
          <strong>SparkComponentRenderer</strong>
        </div>
        <div class="template-dsl-demo__meta-item">
          <span class="template-dsl-demo__meta-label">Data Binding</span>
          <strong>{{ usersRowsKey }} / {{ usersCurrentRowKey }}</strong>
        </div>
      </div>
    </header>

    <section class="template-dsl-demo__panel">
      <h2>Page Toolbar DSL</h2>
      <p class="template-dsl-demo__panel-desc">
        这里直接使用 RToolbar，并通过 #tail 生成 props.tail。顶层 toolbar 只演示结构化 dock 和普通按钮；
        真正带数据语义的 builtin-action 保留在 RTable / RForm 这类有 DataView 上下文的容器内。
      </p>

      <RToolbar :gap="10" :zone-gap="18">
        <SparkChild
          v-for="action in pageToolbarActions"
          :key="`page-toolbar-${action.id}`"
          type="button"
          class="template-dsl-demo__toolbar-button"
          :data-action-id="action.id"
          :on="{ click: handlePageToolbarAction }"
        >{{ action.label }}</SparkChild>

        <template #tail>
          <SparkChild
            v-for="action in pageToolbarTailActions"
            :key="`page-toolbar-tail-${action.id}`"
            type="button"
            class="template-dsl-demo__toolbar-button template-dsl-demo__toolbar-button--tail"
            :data-action-id="action.id"
            :on="{ click: handlePageToolbarAction }"
          >{{ action.label }}</SparkChild>
        </template>
      </RToolbar>

      <p class="template-dsl-demo__toolbar-feedback">{{ toolbarFeedback }}</p>
    </section>

    <div class="template-dsl-demo__grid">
      <section class="template-dsl-demo__panel">
        <h2>运行效果</h2>
        <p class="template-dsl-demo__panel-desc">
          左侧是表格 DSL，右侧是表单 DSL；外层再用 RTabs 组织两个 pane，证明 DSL 已经能覆盖常见页面编排层。
        </p>

        <RTabs v-model="activeTab">
          <template #toolbar>
            <SparkChild
              v-for="action in tabsToolbarActions"
              :key="`tabs-toolbar-${action.id}`"
              type="button"
              class="template-dsl-demo__toolbar-button"
              :data-action-id="action.id"
              :on="{ click: handleTabsToolbarAction }"
            >{{ action.label }}</SparkChild>
          </template>

          <SparkChild type="r-tab-pane" label="表格 DSL" name="table">
            <RTable v-bind="tableNodeProps">
              <template #toolbar>
                <ElButton
                  v-for="action in tableToolbarActions"
                  :key="`table-toolbar-${action.builtinAction}`"
                  :builtin-action="action.builtinAction"
                  :label="action.label"
                />
              </template>

              <component
                :is="resolveDslFieldComponent(field)"
                v-for="field in tableFields"
                :key="`table-field-${field.field}`"
                v-bind="buildDslFieldProps(field)"
              />

              <template #actions>
                <ElButton
                  v-for="action in tableRowActions"
                  :key="`table-action-${action.builtinAction}`"
                  :builtin-action="action.builtinAction"
                  :label="action.label"
                />
              </template>
            </RTable>
          </SparkChild>

          <SparkChild type="r-tab-pane" label="表单 DSL" name="form">
            <RForm v-bind="formNodeProps">
              <template #toolbar>
                <ElButton
                  v-for="action in formToolbarActions"
                  :key="`form-toolbar-${action.builtinAction}`"
                  :builtin-action="action.builtinAction"
                  :label="action.label"
                />
              </template>

              <component
                :is="resolveDslFieldComponent(field)"
                v-for="field in formFields"
                :key="`form-field-${field.field}`"
                v-bind="buildDslFieldProps(field)"
              />
            </RForm>
          </SparkChild>
        </RTabs>
      </section>

      <section class="template-dsl-demo__panel">
        <h2>写法对照</h2>
        <p class="template-dsl-demo__panel-desc">
          左侧是当前 demo 对应的 DSL 写法，中间是配置期 JSON，右侧是运行时 SparkNode JSON。现在两者保持同构，dock 不会再在运行时改写成另一套结构。
        </p>

        <div class="template-dsl-demo__code-blocks">
          <div>
            <h3>Vue DSL</h3>
            <pre class="template-dsl-demo__code"><code>{{ dslSnippet }}</code></pre>
          </div>

          <div>
            <h3>配置期 JSON</h3>
            <pre class="template-dsl-demo__code"><code>{{ configStageSparkNodeSnippet }}</code></pre>
          </div>

          <div>
            <h3>运行时 SparkNode JSON</h3>
            <pre class="template-dsl-demo__code"><code>{{ compiledSparkNodeSnippet }}</code></pre>
          </div>
        </div>
      </section>
    </div>

    <section class="template-dsl-demo__panel template-dsl-demo__panel--notes">
      <h2>边界说明</h2>
      <ul>
        <li>Vue DSL 适合本地 Vue 组件编排 SparkNode 树，强调类型提示、组合体验和源码内联维护。</li>
        <li>rule 配置版仍然是整页配置系统，负责 rule.json、pagedata.json、script.js、css 的统一装配。</li>
        <li>当前 dock 规范已经统一为结构化 dock 节点：表格用 props.toolbar / props.filter / props.actions，工具栏尾区用 props.tail。</li>
        <li>容器内部仍兼容等价的 wrapper children，但运行时输入不会再把配置结构改写成另一套 children 形态。</li>
        <li>旧的 child dock/order 输入在 DSL 中已被忽略，不再作为正式配置语义保留。</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill-description Vue 模板 DSL 演示页，展示通过 Vue SFC 模板直接使用 SPARK 组件的用法。
 */
import { ref } from 'vue'
import {
  ElButton,
  PAGE_DATASET,
  RForm,
  RNumber,
  RTable,
  RTabs,
  RText,
  RToolbar,
  SparkChild,
  useSparkHostScope,
} from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'

type BuiltinActionSpec = {
  builtinAction: string
  label: string
}

type ToolbarDemoActionSpec = {
  id: string
  label: string
}

type DslFieldSpec = {
  kind: 'text' | 'number'
  field: string
  label: string
  width?: number
  min?: number
  max?: number
}

const activeTab = ref('table')
const toolbarFeedback = ref('当前演示动作：未触发')

const employeeDataSet = SparkData.createDataSet({
  dataSetName: 'TemplateDslDemo',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'department', type: 'string' },
        { name: 'role', type: 'string' },
        { name: 'score', type: 'number' },
      ],
      views: {
        default: {
          rows: [
            { id: 1, name: '陈岚', department: '产品', role: '产品经理', score: 91 },
            { id: 2, name: '赵宁', department: '研发', role: '前端工程师', score: 87 },
            { id: 3, name: '林澈', department: '设计', role: '交互设计师', score: 95 },
          ],
        },
      },
    },
  },
})

employeeDataSet.getView('Users', 'default')?.selection.setCurrentRow(
  employeeDataSet.getView('Users', 'default')?.rows[0] ?? null,
)

const usersRowsKey = 'Users@rows'
const usersCurrentRowKey = 'Users@currentRow'

const pageToolbarActions: ToolbarDemoActionSpec[] = [
  { id: 'inspect-main-zone', label: '查看主区' },
  { id: 'inspect-layout-meaning', label: '说明布局' },
]

const pageToolbarTailActions: ToolbarDemoActionSpec[] = [
  { id: 'inspect-tail-zone', label: '查看尾区' },
]

const tabsToolbarActions: ToolbarDemoActionSpec[] = [
  { id: 'focus-table', label: '切到表格 DSL' },
  { id: 'focus-form', label: '切到表单 DSL' },
]

const tableToolbarActions: BuiltinActionSpec[] = [
  { builtinAction: 'append-row', label: '新增行' },
]

const tableRowActions: BuiltinActionSpec[] = [
  { builtinAction: 'delete-row', label: '删除' },
]

const formToolbarActions: BuiltinActionSpec[] = [
  { builtinAction: 'submit-current-form', label: '保存当前' },
]

const tableFields: DslFieldSpec[] = [
  { kind: 'text', field: 'name', label: '姓名', width: 160 },
  { kind: 'text', field: 'department', label: '部门', width: 140 },
  { kind: 'text', field: 'role', label: '角色', width: 160 },
  { kind: 'number', field: 'score', label: '绩效分', width: 120 },
]

const formFields: DslFieldSpec[] = [
  { kind: 'text', field: 'name', label: '姓名' },
  { kind: 'text', field: 'department', label: '部门' },
  { kind: 'text', field: 'role', label: '角色' },
  { kind: 'number', field: 'score', label: '绩效分', min: 0, max: 100 },
]

const tableNodeProps = {
  id: 'dsl-users-table',
  dataKey: usersRowsKey,
  border: true,
  stripe: true,
  highlightCurrentRow: true,
}

const formNodeProps = {
  id: 'dsl-users-form',
  dataKey: usersCurrentRowKey,
  labelWidth: '88px',
  gridColumns: 24,
  gridGap: 12,
}

const { sparkProvide } = useSparkHostScope('template-dsl-demo-page')
sparkProvide(PAGE_DATASET, employeeDataSet)

function resolveToolbarActionId(event: Event): string | null {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return null
  const actionId = target.dataset['actionId']?.trim()
  return actionId && actionId.length > 0 ? actionId : null
}

function resolveToolbarActionLabel(actions: ToolbarDemoActionSpec[], actionId: string): string {
  return actions.find(action => action.id === actionId)?.label ?? actionId
}

function handlePageToolbarAction(event: Event): void {
  const actionId = resolveToolbarActionId(event)
  if (actionId === null) return
  const label = resolveToolbarActionLabel([
    ...pageToolbarActions,
    ...pageToolbarTailActions,
  ], actionId)
  toolbarFeedback.value = `当前演示动作：Page Toolbar -> ${label}`
}

function handleTabsToolbarAction(event: Event): void {
  const actionId = resolveToolbarActionId(event)
  if (actionId === null) return
  activeTab.value = actionId === 'focus-form' ? 'form' : 'table'
  const label = resolveToolbarActionLabel(tabsToolbarActions, actionId)
  toolbarFeedback.value = `当前演示动作：Tabs Toolbar -> ${label}`
}

function resolveDslFieldComponent(field: DslFieldSpec) {
  return field.kind === 'number' ? RNumber : RText
}

function buildDslFieldProps(field: DslFieldSpec): Record<string, string | number> {
  return {
    field: field.field,
    label: field.label,
    ...(field.width !== undefined ? { width: field.width } : {}),
    ...(field.min !== undefined ? { min: field.min } : {}),
    ...(field.max !== undefined ? { max: field.max } : {}),
  }
}

function resolveDslFieldType(field: DslFieldSpec): 'r-text' | 'r-number' {
  return field.kind === 'number' ? 'r-number' : 'r-text'
}

function buildBuiltinActionNode(action: BuiltinActionSpec) {
  return {
    type: 'builtin-action',
    props: {
      builtinAction: action.builtinAction,
      label: action.label,
    },
  }
}

function buildDemoButtonNode(action: ToolbarDemoActionSpec, handlerName: string, className = 'template-dsl-demo__toolbar-button') {
  return {
    type: 'button',
    props: {
      class: className,
      'data-action-id': action.id,
      on: {
        click: handlerName,
      },
    },
    children: [action.label],
  }
}

function buildFieldNode(field: DslFieldSpec) {
  return {
    type: resolveDslFieldType(field),
    props: buildDslFieldProps(field),
  }
}

function buildStructuredZoneNode(type: 'r-toolbar' | 'r-actions', actions: BuiltinActionSpec[]) {
  return {
    type,
    children: actions.map(buildBuiltinActionNode),
  }
}

function buildStructuredDockNode(type: 'r-toolbar' | 'r-tail', children: Array<ReturnType<typeof buildDemoButtonNode>>) {
  return {
    type,
    children,
  }
}

function formatDslAction(action: BuiltinActionSpec, indent: string): string {
  return `${indent}<ElButton builtin-action="${action.builtinAction}" label="${action.label}" />`
}

function formatDslButton(action: ToolbarDemoActionSpec, indent: string, handlerName: string, className = 'template-dsl-demo__toolbar-button'): string {
  return `${indent}<SparkChild type="button" class="${className}" data-action-id="${action.id}" :on="{ click: ${handlerName} }">${action.label}</SparkChild>`
}

function formatDslField(field: DslFieldSpec, indent: string): string {
  const componentName = field.kind === 'number' ? 'RNumber' : 'RText'
  const attrs = [
    `field="${field.field}"`,
    `label="${field.label}"`,
    ...(field.width !== undefined ? [`:width="${field.width}"`] : []),
    ...(field.min !== undefined ? [`:min="${field.min}"`] : []),
    ...(field.max !== undefined ? [`:max="${field.max}"`] : []),
  ]
  return `${indent}<${componentName} ${attrs.join(' ')} />`
}

const dslSnippet = [
  '<RToolbar :gap="10" :zone-gap="18">',
  ...pageToolbarActions.map((action) => formatDslButton(action, '  ', 'handlePageToolbarAction')),
  '  <template #tail>',
  ...pageToolbarTailActions.map((action) => formatDslButton(action, '    ', 'handlePageToolbarAction', 'template-dsl-demo__toolbar-button template-dsl-demo__toolbar-button--tail')),
  '  </template>',
  '</RToolbar>',
  '',
  '<RTabs v-model="activeTab">',
  '  <template #toolbar>',
  ...tabsToolbarActions.map((action) => formatDslButton(action, '    ', 'handleTabsToolbarAction')),
  '  </template>',
  '',
  '  <SparkChild type="r-tab-pane" label="表格 DSL" name="table">',
  `    <RTable v-bind="{ id: '${tableNodeProps.id}', dataKey: '${usersRowsKey}', border: true, stripe: true, highlightCurrentRow: true }">`,
  '      <template #toolbar>',
  ...tableToolbarActions.map((action) => formatDslAction(action, '        ')),
  '      </template>',
  '',
  ...tableFields.map((field) => formatDslField(field, '      ')),
  '',
  '      <template #actions>',
  ...tableRowActions.map((action) => formatDslAction(action, '        ')),
  '      </template>',
  '    </RTable>',
  '  </SparkChild>',
  '',
  '  <SparkChild type="r-tab-pane" label="表单 DSL" name="form">',
  `    <RForm v-bind="{ id: '${formNodeProps.id}', dataKey: '${usersCurrentRowKey}', labelWidth: '${formNodeProps.labelWidth}', gridColumns: ${formNodeProps.gridColumns}, gridGap: ${formNodeProps.gridGap} }">`,
  '      <template #toolbar>',
  ...formToolbarActions.map((action) => formatDslAction(action, '        ')),
  '      </template>',
  '',
  ...formFields.map((field) => formatDslField(field, '      ')),
  '    </RForm>',
  '  </SparkChild>',
  '</RTabs>',
].join('\n')

const configStageSparkNode = [
  {
    type: 'r-toolbar',
    props: {
      gap: 10,
      zoneGap: 18,
      tail: buildStructuredDockNode('r-tail', pageToolbarTailActions.map(action =>
        buildDemoButtonNode(action, 'handlePageToolbarAction', 'template-dsl-demo__toolbar-button template-dsl-demo__toolbar-button--tail')
      )),
    },
    children: pageToolbarActions.map(action => buildDemoButtonNode(action, 'handlePageToolbarAction')),
  },
  {
    type: 'r-tabs',
    props: {
      modelValue: 'table',
      toolbar: buildStructuredDockNode('r-toolbar', tabsToolbarActions.map(action => buildDemoButtonNode(action, 'handleTabsToolbarAction'))),
    },
    children: [
      {
        type: 'r-tab-pane',
        props: { label: '表格 DSL', name: 'table' },
        children: [
          {
            type: 'r-table',
            id: tableNodeProps.id,
            props: {
              dataKey: usersRowsKey,
              border: tableNodeProps.border,
              stripe: tableNodeProps.stripe,
              highlightCurrentRow: tableNodeProps.highlightCurrentRow,
              toolbar: buildStructuredZoneNode('r-toolbar', tableToolbarActions),
              actions: buildStructuredZoneNode('r-actions', tableRowActions),
            },
            children: tableFields.map(buildFieldNode),
          },
        ],
      },
      {
        type: 'r-tab-pane',
        props: { label: '表单 DSL', name: 'form' },
        children: [
          {
            type: 'r-form',
            id: formNodeProps.id,
            props: {
              dataKey: usersCurrentRowKey,
              labelWidth: formNodeProps.labelWidth,
              gridColumns: formNodeProps.gridColumns,
              gridGap: formNodeProps.gridGap,
              toolbar: buildStructuredZoneNode('r-toolbar', formToolbarActions),
            },
            children: formFields.map(buildFieldNode),
          },
        ],
      },
    ],
  },
]

const compiledSparkNode = configStageSparkNode

const configStageSparkNodeSnippet = JSON.stringify(configStageSparkNode, null, 2)
const compiledSparkNodeSnippet = JSON.stringify(compiledSparkNode, null, 2)
</script>

<style scoped>
.template-dsl-demo {
  display: grid;
  gap: 24px;
  padding: 24px;
}

.template-dsl-demo__hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.9fr);
  gap: 20px;
  padding: 24px;
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(14, 116, 144, 0.16), transparent 34%),
    linear-gradient(140deg, #f7f2e7 0%, #eef7ff 100%);
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.template-dsl-demo__eyebrow {
  margin: 0 0 8px;
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.template-dsl-demo__hero h1 {
  margin: 0;
  color: #0f172a;
  font-size: 32px;
  line-height: 1.15;
}

.template-dsl-demo__summary {
  margin: 12px 0 0;
  max-width: 760px;
  color: #334155;
  line-height: 1.7;
}

.template-dsl-demo__meta {
  display: grid;
  gap: 12px;
}

.template-dsl-demo__meta-item,
.template-dsl-demo__panel {
  padding: 20px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
}

.template-dsl-demo__meta-label {
  display: block;
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
}

.template-dsl-demo__panel h2 {
  margin: 0 0 10px;
  color: #0f172a;
  font-size: 18px;
}

.template-dsl-demo__panel-desc {
  margin: 0 0 16px;
  color: #475569;
  line-height: 1.6;
}

.template-dsl-demo__toolbar-feedback {
  margin: 12px 0 0;
  color: #0f766e;
  font-size: 13px;
  font-weight: 600;
}

.template-dsl-demo__toolbar-button {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 999px;
  background: #ffffff;
  color: #0f172a;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  padding: 10px 14px;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}

.template-dsl-demo__toolbar-button:hover {
  border-color: rgba(15, 118, 110, 0.4);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.template-dsl-demo__toolbar-button--tail {
  background: #0f766e;
  border-color: #0f766e;
  color: #f8fafc;
}

.template-dsl-demo__toolbar-button--tail:hover {
  border-color: #115e59;
}

.template-dsl-demo__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.95fr);
  gap: 20px;
}

.template-dsl-demo__code-blocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.template-dsl-demo__code-blocks h3 {
  margin: 0 0 10px;
  color: #0f172a;
  font-size: 15px;
}

.template-dsl-demo__code {
  overflow: auto;
  margin: 0;
  padding: 16px;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.6;
}

.template-dsl-demo__panel--notes ul {
  margin: 0;
  padding-left: 18px;
  color: #334155;
  line-height: 1.8;
}

@media (max-width: 960px) {
  .template-dsl-demo__hero,
  .template-dsl-demo__grid {
    grid-template-columns: 1fr;
  }
}
</style>