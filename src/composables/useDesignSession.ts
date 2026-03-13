import { ref, computed } from 'vue'
import { COMPONENT_PROPS_CATALOG } from './componentPropsCatalog'

// ── Types ────────────────────────────────────────────────────────────────────

export type ProposalType =
  | 'data-model'
  | 'ui-structure'
  | 'interaction'
  | 'style'
  | 'api-config'
  | 'db-schema'
  | 'dict-entry'

export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

export type SessionPhase =
  | 'discussing'
  | 'validating'
  | 'correcting'
  | 'ready'
  | 'reviewing'
  | 'generating'
  | 'verifying'
  | 'iterating'
  | 'applied'
  | 'failed'

export interface DesignProposal {
  id: string
  type: ProposalType
  title: string
  /** 提案核心内容（JSON 或代码） */
  content: string
  status: ProposalStatus
  /** 所属聊天消息 ID */
  messageId: string
  /** 提案所属工作流阶段 */
  stage: string
  timestamp: Date
}

/** @@ 协议提取的原始块 */
export interface ProtocolBlock {
  type: string   // 'proposal' | 'query' | 'review' | 'error'
  name: string   // kebab-case: 'data-model' | 'component-props' | ...
  payload: string
}

/** 验证反馈（结构化） */
export interface ValidationFeedback {
  severity: 'error' | 'warning' | 'info'
  proposalName: string
  checkType: 'json-syntax' | 'datakey-format' | 'table-reference'
            | 'component-type' | 'script-reference' | 'schema'
  message: string
  suggestion?: string
}

/** 审核清单条目 */
export interface ReviewChecklistItem {
  id: string
  category: 'db-change' | 'dict-change' | 'naming' | 'security' | 'consistency' | 'ux'
  severity: 'blocker' | 'warning' | 'info'
  description: string
  status: 'pending' | 'approved' | 'rejected' | 'auto-passed'
  feedback?: string
  relatedProposalId?: string
  autoFixSuggestion?: string
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ProposalType, string> = {
  'data-model': '📊 数据模型',
  'ui-structure': '🎨 UI 结构',
  'interaction': '⚡ 交互逻辑',
  'style': '🎭 样式',
  'api-config': '🔌 API 配置',
  'db-schema': '🗄️ 数据库变更',
  'dict-entry': '📖 字典变更',
}

const TYPE_ICONS: Record<ProposalType, string> = {
  'data-model': '📊',
  'ui-structure': '🎨',
  'interaction': '⚡',
  'style': '🎭',
  'api-config': '🔌',
  'db-schema': '🗄️',
  'dict-entry': '📖',
}

export function typeLabel(type: ProposalType): string {
  return TYPE_LABELS[type]
}

export function typeIcon(type: ProposalType): string {
  return TYPE_ICONS[type]
}

// ── @@ 定界符协议解析 ────────────────────────────────────────────────────────

/** 匹配 @@type:name ... @@end 定界块（多行模式） */
const BLOCK_RE = /^@@(\w+):([\w-]+)\s*$([\s\S]*?)^@@end\s*$/gm

/**
 * 从文本中提取所有 @@ 协议块
 */
export function extractBlocks(text: string): ProtocolBlock[] {
  const blocks: ProtocolBlock[] = []
  BLOCK_RE.lastIndex = 0
  let m: RegExpExecArray | null = BLOCK_RE.exec(text)
  while (m !== null) {
    blocks.push({ type: m[1] ?? '', name: m[2] ?? '', payload: (m[3] ?? '').trim() })
    m = BLOCK_RE.exec(text)
  }
  return blocks
}

// ── 提案提取（@@ 协议优先，XML 标签兼容） ────────────────────────────────────

/** 旧 XML 格式匹配（向后兼容） */
const PROPOSAL_RE = /<proposal\s+type="([^"]+)"\s+title="([^"]*)"(?:\s+stage="([^"]*)")?\s*>([\s\S]*?)<\/proposal>/gi
const VALID_TYPES = new Set<ProposalType>([
  'data-model', 'ui-structure', 'interaction', 'style', 'api-config',
  'db-schema', 'dict-entry',
])

/**
 * 从 @@ 协议块提取 proposal，payload 第一行 `# title` 作为标题
 */
function proposalsFromBlocks(blocks: ProtocolBlock[], messageId: string): DesignProposal[] {
  return blocks
    .filter((b) => b.type === 'proposal')
    .map((b) => {
      const rawType = b.name.toLowerCase()
      const type: ProposalType = VALID_TYPES.has(rawType as ProposalType)
        ? (rawType as ProposalType)
        : 'ui-structure'

      // 第一行 `# xxx` 作为标题，其余为内容
      const lines = b.payload.split('\n')
      let title = ''
      let content = b.payload
      if (lines[0]?.startsWith('# ')) {
        title = lines[0].slice(2).trim()
        content = lines.slice(1).join('\n').trim()
      }

      return {
        id: crypto.randomUUID(),
        type,
        title: title || typeLabel(type),
        content,
        status: 'pending' as ProposalStatus,
        messageId,
        stage: '',
        timestamp: new Date(),
      }
    })
}

/**
 * 从旧 XML 标签提取 proposal（兼容模式）
 */
function proposalsFromXml(content: string, messageId: string): DesignProposal[] {
  const proposals: DesignProposal[] = []
  PROPOSAL_RE.lastIndex = 0
  let match: RegExpExecArray | null = PROPOSAL_RE.exec(content)
  while (match !== null) {
    const rawType = (match[1] ?? '').toLowerCase()
    const type: ProposalType = VALID_TYPES.has(rawType as ProposalType)
      ? (rawType as ProposalType)
      : 'ui-structure'
    proposals.push({
      id: crypto.randomUUID(),
      type,
      title: (match[2] ?? '') || typeLabel(type),
      content: (match[4] ?? '').trim(),
      status: 'pending',
      messageId,
      stage: (match[3] ?? '').trim(),
      timestamp: new Date(),
    })
    match = PROPOSAL_RE.exec(content)
  }
  return proposals
}

/**
 * 从 AI 回复中提取结构化提案（@@ 协议优先，XML 兼容）
 */
export function extractProposals(
  content: string,
  messageId: string,
): { cleanContent: string; proposals: DesignProposal[] } {
  const blocks = extractBlocks(content)
  let proposals: DesignProposal[]

  if (blocks.length > 0) {
    // @@ 协议模式
    proposals = proposalsFromBlocks(blocks, messageId)
  } else {
    // XML 兼容模式
    proposals = proposalsFromXml(content, messageId)
  }

  const cleanContent = stripProtocolBlocks(content)
  return { cleanContent, proposals }
}

/**
 * 从显示内容中去除 @@ 定界块和旧 XML 标记（用于流式渲染期间的实时清理）
 */
export function stripProposalTags(content: string): string {
  return stripProtocolBlocks(content)
}

/** 内部：清理所有协议标记 */
function stripProtocolBlocks(content: string): string {
  return content
    // @@ 协议块（完整）
    .replace(BLOCK_RE, '')
    // @@ 协议块（流式中途，未闭合）
    .replace(/^@@\w+:[\w-]+\s*$[\s\S]*$/m, '')
    // 旧 XML 标签（完整）
    .replace(/<proposal[\s\S]*?<\/proposal>/gi, '')
    .replace(/<query[\s\S]*?<\/query>/gi, '')
    // 旧 XML 标签（流式中途）
    .replace(/<proposal[^>]*>[\s\S]*/i, '')
    .replace(/<query[^>]*>[\s\S]*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── 查询提取（@@ 协议优先，XML 兼容） ────────────────────────────────────────

/** 旧 XML query 格式 */
const QUERY_RE = /<query\s+type="component-props"\s*>([\s\S]*?)<\/query>/gi

/** 自动查询消息的固定前缀（用于 UI 识别和防重入） */
export const AUTO_QUERY_PREFIX = '🔧 [组件 Props 查询结果]'

/**
 * 从 AI 回复中提取组件 Props 查询请求（@@ 协议 + XML 兼容）
 */
export function extractComponentQueries(content: string): string[] {
  const components: string[] = []

  // @@ 协议模式
  const blocks = extractBlocks(content)
  for (const b of blocks) {
    if (b.type === 'query' && b.name === 'component-props') {
      const items = b.payload.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
      components.push(...items)
    }
  }

  // XML 兼容模式（仅当 @@ 未匹配到 query 时）
  if (components.length === 0) {
    QUERY_RE.lastIndex = 0
    let match = QUERY_RE.exec(content)
    while (match !== null) {
      const raw = match[1] ?? ''
      const items = raw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
      components.push(...items)
      match = QUERY_RE.exec(content)
    }
  }

  return [...new Set(components)]
}

/**
 * 根据组件类型列表查找 Props 目录，构建查询响应文本
 */
export function resolveComponentQuery(components: string[]): string | null {
  if (components.length === 0) return null
  const sections: string[] = []
  for (const comp of components) {
    const info = COMPONENT_PROPS_CATALOG[comp]
    if (info) {
      sections.push(info)
    } else {
      sections.push(`**${comp}** — 未收录（可使用 Element Plus 文档中的标准 Props）`)
    }
  }
  return sections.join('\n\n')
}

// ── 生成提示词 ───────────────────────────────────────────────────────────────

/**
 * 从已采纳的提案构建最终生成提示词
 */
export function buildGenerationPrompt(
  proposals: DesignProposal[],
  userGoal: string,
): string {
  const accepted = proposals.filter((p) => p.status === 'accepted')
  if (accepted.length === 0) {
    return userGoal
  }

  const sections: string[] = [
    `用户需求：${userGoal}`,
    '',
    '以下是用户已确认的设计决策，请严格据此生成完整的 SPARK 页面配置（4 个文件）：',
    '',
  ]

  const grouped = new Map<ProposalType, DesignProposal[]>()
  for (const p of accepted) {
    const list = grouped.get(p.type) ?? []
    list.push(p)
    grouped.set(p.type, list)
  }

  for (const [type, items] of grouped) {
    sections.push(`## ${typeLabel(type)}`)
    for (const item of items) {
      sections.push(`### ${item.title}`)
      sections.push('```')
      sections.push(item.content)
      sections.push('```')
      sections.push('')
    }
  }

  sections.push(
    '请根据以上所有设计决策，生成完整的 rule.json、pagedata.json、script.js 和 style.css。',
    '确保数据模型与 UI 结构之间的 dataKey 绑定正确。',
  )

  return sections.join('\n')
}

// ── 设计模式系统提示词（三层架构：宪法 → 流程 → 协议） ─────────────────────

export const DESIGN_SYSTEM_PROMPT = `# 层-1 核心宪法（不可违反）

你是 SPARK 低代码平台的页面设计顾问。你与用户是**渐进式协商**关系。

## 硬规则

1. **分步提案**：禁止一次性输出完整方案。每轮对话围绕 1-3 个设计决策展开，等用户反馈后再推进。
2. **提案即决策**：所有可落地的设计决策**必须**用 \`@@proposal:type-name ... @@end\` 定界块包裹。块外只写解释性 Markdown 文字。
3. **不确定即追问**：需求模糊时主动追问，不猜测用户意图，不编造数据。
4. **拒绝 → 替代**：用户拒绝提案后，必须询问修改方向，再出替代方案。禁止重复提交相同内容。
5. **中文沟通**，代码/JSON 保持英文。

---

# 层-2 工作流程（阶段门控）

## 阶段模型

| # | 阶段 | 核心产出 | 入口条件 |
|---|------|---------|---------|
| 1 | 需求理解 | 业务目标、数据范围、交互场景的共识 | — |
| 2 | 数据建模 | \`data-model\` 提案 | 阶段 1 共识达成 |
| 3 | UI 设计 | \`ui-structure\` 提案 | 至少一个 data-model 被采纳 |
| 4 | 交互设计 | \`interaction\` 提案 | 至少一个 ui-structure 被采纳 |
| 5 | API 配置 | \`api-config\` 提案（可选） | 用户需要远程数据时 |
| 6 | 样式打磨 | \`style\` 提案（可选） | 用户主动提出样式需求 |

## 推进规则

- **禁止跳过阶段 1**：首轮必须理解需求、追问关键细节，不出 proposal
- **前向依赖**：阶段 N 的提案可引用阶段 N-1 已采纳的内容（如表名、字段名），确保一致性
- **单轮上限 3 个 proposal**：防止信息过载
- **每个 proposal 聚焦一个决策点**：一张表、一个 UI 区块、一个交互行为
- 如用户明确"快速生成"/"不用讨论"，可将阶段 2-4 压缩为单轮多提案

---

# 层-3 输出协议

## 消息结构（@@ 定界协议）

正常用 Markdown 解释设计思路。每个设计决策用 \`@@proposal:name\` 定界块包裹：

\`\`\`
@@proposal:data-model
# 订单主表结构
{
  "tableName": "Orders",
  "columns": [...]
}
@@end
\`\`\`

**格式规则**：
- \`@@proposal:name\` 单独占一行（name 使用 kebab-case，取自下方类型标识表）
- payload 第一行 \`# 标题\` 作为提案标题（必填）
- payload 其余部分为提案内容（JSON 或代码）
- \`@@end\` 单独占一行，结束当前块

## 类型标识（name 字段，必填）

| name | 内容格式 | 说明 |
|------|---------|------|
| \`data-model\` | pagedata.json 中 tables 片段（JSON） | 表结构、字段、列定义、关系 |
| \`ui-structure\` | rule.json 片段（JSON 数组） | 组件树、布局方案 |
| \`interaction\` | script.js 代码 | 事件处理、数据操作逻辑 |
| \`api-config\` | 表的 api 配置（JSON） | 远程数据端点配置 |
| \`style\` | CSS 代码 | 视觉样式 |
| \`db-schema\` | DDL 或迁移脚本 | 数据库表变更 |
| \`dict-entry\` | 字典 JSON | 字典/枚举变更 |

## stage 字段（标记当前工作阶段）

值为：\`needs-analysis\` / \`data-modeling\` / \`ui-design\` / \`interaction-design\` / \`api-config\` / \`style-polish\`

## 组件 Props 查询协议

你**不需要记住**所有 SPARK 组件的 Props。当你需要查看某个组件的详细 Props 时，输出查询块：

\`\`\`
@@query:component-props
r-table, r-form, r-select
@@end
\`\`\`

系统会自动返回这些组件的完整 Props 定义，你再基于真实 Props 继续设计。

**使用时机**：进入 UI 设计阶段（阶段 3+），需要确认容器或字段组件的可用 Props 时。
**限制**：一次最多查询 5 个组件；查询块独立成段，不要嵌入 \`@@proposal:*\` 块内。

---

# 层-4 SPARK 平台规则（提案内容必须遵守）

## Rule 节点通用结构（核心语法，等价于声明式 \`h(type, props, children)\`）

rule.json **顶层是 JSON 数组**（通常只有一个根 div）。每个节点的完整字段：

\`\`\`jsonc
{
  "type": "组件类型",              // 必填。kebab-case。可选值见下方「组件注册表」
  "props": { ... },               // 组件 props 对象
  "children": [ /* 子节点 */ ],    // 嵌套子组件（递归同结构）或纯文本字符串
  "on": { "事件名": "函数名" },    // 事件绑定 → script.js 中的同名函数
  "style": { "padding": "16px" }, // 内联样式（优先对象，也可字符串）
  "class": "my-class",            // CSS 类名
  "name": "fieldName",            // 字段绑定名（r-* 字段组件必填，映射到 DataView 行字段）
  "dataKey": "Table@rows",        // SPARK 数据绑定键（容器组件用，格式见 DataKey 规则）
  "value": "默认值",               // 表单字段默认值
  "key": "唯一标识"                // Vue key（列表渲染时防重复）
}
\`\`\`

**组件注册表**（type 允许值）：

| 分组 | 允许的 type |
|------|------------|
| HTML 原生 | div, span, p, h1-h6, strong, br, pre, a, label, table, thead, tbody, tr, th, td, ul, li, img |
| Element Plus | el-table, el-table-column, el-row, el-col, el-select, el-option, el-pagination, el-switch, el-radio-group, el-checkbox-group, el-form, el-form-item, el-dialog, el-drawer, el-tabs, el-tab-pane, el-divider |
| SPARK 容器 | r-table, r-form, r-detail, r-tree, r-list, r-tabs, r-collapse, r-dialog, r-drawer, r-steps, r-section, r-block |
| SPARK 字段 | r-text, r-textarea, r-number, r-date, r-html-editor, r-select, r-multi-select, r-radio, r-checkbox, r-checkbox-group, r-switch, r-slider, r-rate, r-cascader, r-tree-select, r-transfer, r-color, r-icon, r-image, r-file-path, r-file-browser, r-upload, r-entity-picker, r-user-picker, r-dept-picker, r-product-picker |
| Render* | script.js 中定义的以 Render 开头的函数名（如 RenderToolbar） |
| 禁用 | ~~el-descriptions, el-collapse, el-timeline, el-steps, el-transfer, el-calendar, el-image~~ → 用 r-* 容器替代 |

**容器内子组件嵌套规则**：

| 容器 | children 允许 |
|------|-------------|
| el-table | el-table-column / Render* |
| r-table | r-* 字段组件（推荐） / el-table-column（兼容） |
| r-form / r-detail / r-list | r-* 字段组件 |
| r-tabs | r-tab-pane → 内容区可放 r-* 容器/字段/Render* |
| r-collapse | r-collapse-item → 同上 |
| r-dialog / r-drawer | r-* 容器/字段/Render* |
| r-steps | r-step → 同上 |
| r-section / r-block | r-* 容器/字段/Render*；props.headerActions 放操作区 |

**速记**：\`type\` 决定"是什么"，\`props\` 决定"长什么样"，\`children\` 决定"包含什么"，\`on\` 决定"怎么交互"，\`dataKey\` 决定"绑什么数据"，\`name\` 决定"对应哪个字段"。

## 防幻觉自检清单（每个 proposal 生成前必须通过）

1. dataKey 表名是否与 data-model 提案的表名**大小写一致**？
2. 组件 type 是否在已注册列表内（r-* / el-* / HTML 标签 / Render*）？
3. Render* 内 h() 是否**仅使用原生 HTML 标签**？
4. script.js 函数名是否与 rule.json 中 on / type 引用**一一对应**？
5. 是否引用了禁用组件（el-descriptions / el-collapse / el-timeline / el-steps / el-transfer）？
6. relation 是否仅使用标准字段（parentTable/parentField/childTable/childField/dependencyType）？
7. el-table 是否声明了 \`border: true\`？需高亮时是否加 \`highlightCurrentRow: true\`？

## DataKey 格式

- 2 段：\`tableName@field\`（viewId 默认 default）
- 3 段：\`tableName@viewId@field\`
- field 可选值：rows / currentRow / selectedRows / summaryRow / selectionSummaryRow
- **表名大小写必须与 pagedata.json 完全一致**

## 组件约束

| 规则 | 说明 |
|------|------|
| r-table 列（推荐） | 用 r-text / r-number / r-date 等 r-* 字段，name=字段名，props.label=表头；支持权限渲染、上下文感知 |
| r-table 列（兼容） | el-table-column 也可在 r-table 内使用，但不具备字段级权限、上下文感知等增强特性 |
| r-table 行操作 | 写在 props.rowActions，引用 Render* 函数 |
| el-table 列 | 仅限 el-table-column 或 Render*；el-table-column.width 用字符串 \`"100"\`，r-* 字段 width 用数字 \`120\` |
| Render* 内 h() | 仅限原生 HTML 标签（div/span/button/table/tr/td/input 等） |
| 块状容器 | r-form / r-detail / r-section / r-block 默认 CSS Grid 24 列 |
| 容器操作区 | props.headerActions / footerActions / toolbar 优先用 Render*，不直接放 el-button |

## 数据规则

| 规则 | 说明 |
|------|------|
| 每张表必须有 \`views.default\` | 否则表格无法渲染 |
| 行数据放 \`views.default.rows\` | 提供 3-5 条代表性测试数据 |
| 父表主键 | 标记 \`isPrimaryKey: true\`，否则 relation 不生效 |
| 主从联动主表 | 加 \`autoCurrentFirst: true\`，避免子表初始为空 |
| relation 字段 | 仅 parentTable / parentField / childTable / childField / dependencyType |
| 内联数据 | 不加 api 字段 |
| 计算列 | \`computeExpression\` 逐行计算；\`aggregates\` 视图级聚合；两者独立 |
| 计算列不预填值 | rows 中不手动写计算列的值，由运行时自动计算 |

## 脚本规则

| 规则 | 说明 |
|------|------|
| 沙箱变量 | \`$api / $dataSet / $page / $route / $refreshData / SparkData / h\` |
| 必须有 \`__init__()\` | 数据订阅在 __init__ 中注册 |
| UI 消息 | 用 \`$page.showMessage / showConfirm\`，禁止 ElMessage |
| 树场景 | 禁止 \`$rebindRules()\`，改用 \`view.replaceRows()\` + DOM 直写 |
| 事件签名 | \`currentRowChanged\` handler 第一参数直接是 currentRow，不是事件对象 |
| 父子联动 | 优先用 relations 配置，不手写 watch + 过滤 |
| 跨函数状态 | \`let _pageState = {}\` 模块顶层声明 |`

// ── Composable ───────────────────────────────────────────────────────────────

export function useDesignSession() {
  const pageId = ref('')
  const phase = ref<SessionPhase>('discussing')
  const proposals = ref<DesignProposal[]>([])
  const userGoal = ref('')

  const acceptedProposals = computed(() =>
    proposals.value.filter((p) => p.status === 'accepted'),
  )

  const pendingProposals = computed(() =>
    proposals.value.filter((p) => p.status === 'pending'),
  )

  const hasAccepted = computed(() => acceptedProposals.value.length > 0)

  /** 按消息 ID 分组的提案映射（用于在消息后渲染对应提案卡） */
  const proposalsByMessage = computed(() => {
    const map = new Map<string, DesignProposal[]>()
    for (const p of proposals.value) {
      const list = map.get(p.messageId) ?? []
      list.push(p)
      map.set(p.messageId, list)
    }
    return map
  })

  /** 按类型分组的已采纳提案（侧栏展示） */
  const acceptedByType = computed(() => {
    const map = new Map<ProposalType, DesignProposal[]>()
    for (const p of acceptedProposals.value) {
      const list = map.get(p.type) ?? []
      list.push(p)
      map.set(p.type, list)
    }
    return map
  })

  function addProposals(newProposals: DesignProposal[]) {
    proposals.value.push(...newProposals)
  }

  function acceptProposal(id: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.status = 'accepted'
  }

  function rejectProposal(id: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.status = 'rejected'
  }

  /** 撤回已采纳的提案（从侧栏移除） */
  function revokeProposal(id: string) {
    const p = proposals.value.find((x) => x.id === id)
    if (p) p.status = 'pending'
  }

  function reset() {
    pageId.value = ''
    phase.value = 'discussing'
    proposals.value = []
    userGoal.value = ''
  }

  return {
    pageId,
    phase,
    proposals,
    userGoal,
    acceptedProposals,
    pendingProposals,
    hasAccepted,
    proposalsByMessage,
    acceptedByType,
    addProposals,
    acceptProposal,
    rejectProposal,
    revokeProposal,
    reset,
  }
}
