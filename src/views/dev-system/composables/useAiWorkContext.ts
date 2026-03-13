/**
 * AI 工作上下文构建 — 根据当前阶段动态构建 system prompt 和上下文数据
 */
import type {
  ProjectStage,
  ProjectState,
  AiWorkContext,
  AiPanelMode,
  QuickAction,
  FunctionModule,
  PagePlan,
} from './types'

// ── System Prompts ────────────────────────────────────────────

const REQUIREMENTS_PROMPT = `你是 SPARK 低代码平台的需求分析顾问。

你的任务是帮助用户澄清和结构化业务需求。请通过追问明确以下要素：

1. **业务目标**：这个功能解决什么业务问题？
2. **核心实体**：涉及哪些数据对象（如订单、客户、产品）？
3. **业务场景**：主要操作流程（CRUD? 审批? 统计? 导入导出?）
4. **用户角色**：谁使用这些功能？不同角色有什么区别？
5. **关键约束**：性能要求? 数据量级? 权限控制粒度?

输出格式：用清晰的分类列表回复，每次围绕 1-2 个要素追问。
当所有要素明确后，输出完整的需求摘要请用户确认。`

const FUNCTION_PLANNING_PROMPT = `你是 SPARK 低代码平台的功能架构师。

基于用户已确认的需求摘要，规划功能模块和页面。

## 输出格式（JSON）

@@proposal:function-plan
# 功能模块规划
{
  "modules": [
    {
      "name": "模块名称",
      "icon": "📦",
      "description": "功能说明",
      "pages": [
        {
          "pageId": "kebab-case-id",
          "title": "页面标题",
          "description": "页面功能描述",
          "pageType": "list",
          "dataEntities": ["TableName"]
        }
      ]
    }
  ]
}
@@end

## 规划原则
1. 每个模块聚焦一个业务域
2. 页面粒度：一屏 = 一个核心操作（不要把所有功能塞进一个页面）
3. pageId 用 kebab-case，全局唯一
4. 相关数据实体要在 dataEntities 中声明（后续页面设计会用到）
5. pageType 枚举：list | detail | form | dashboard | tree | custom`

const NAVIGATION_DESIGN_PROMPT = `你是 SPARK 低代码平台的导航架构师。

基于已确认的功能模块规划，生成导航结构 NavRoot JSON。

## 输出格式

@@proposal:navigation
# 导航结构
{
  "childPlacement": "header",
  "children": [
    {
      "id": "module-id",
      "title": "模块名称",
      "icon": "📦",
      "childPlacement": "sidebar",
      "redirect": "/first-page-path",
      "children": [
        { "id": "page-nav-id", "title": "页面标题", "icon": "📋", "path": "/page-id", "pageId": "page-id" }
      ]
    }
  ]
}
@@end

## 导航设计原则
1. 顶层模块放 header（水平导航），子页面放 sidebar（侧边栏）
2. 每个叶子节点必须有 path 和 pageId
3. 模块节点设 redirect 到第一个子页面的 path
4. 图标用 emoji（与功能语义匹配）
5. 节点 ID 全局唯一，用 kebab-case`

const ITERATION_PROMPT = `你是 SPARK 低代码平台的页面调试助手。

当前页面存在错误或用户反馈需要修改。请分析错误日志和用户反馈，生成修正后的页面配置。

## 修复原则
1. 只修改有问题的部分，不要重写整个配置
2. 明确说明每处修改的原因
3. 如果是数据绑定错误，检查 DataKey 格式是否正确
4. 如果是组件错误，检查组件是否已注册`

// ── Quick Actions ─────────────────────────────────────────────

const REQ_ACTIONS: QuickAction[] = [
  {
    label: '分析需求',
    action: 'analyze',
    promptTemplate: '请分析以下需求，列出核心实体、业务场景和用户角色：\n\n{{requirementDescription}}',
  },
  {
    label: '列出实体',
    action: 'entities',
    promptTemplate: '基于当前需求讨论，请列出所有数据实体及其关键字段',
  },
]

const FUNC_ACTIONS: QuickAction[] = [
  {
    label: '规划模块',
    action: 'plan-modules',
    promptTemplate: '请根据已确认的需求，规划功能模块和页面清单',
  },
  {
    label: '优化划分',
    action: 'optimize',
    promptTemplate: '请检查当前模块划分是否合理，有没有可以合并或拆分的模块',
  },
]

const NAV_ACTIONS: QuickAction[] = [
  {
    label: '生成导航',
    action: 'generate-nav',
    promptTemplate: '请根据功能模块规划，生成导航结构 JSON',
  },
  {
    label: '优化层级',
    action: 'optimize-nav',
    promptTemplate: '请检查当前导航层级是否清晰，层级是否过深',
  },
]

const DESIGN_ACTIONS: QuickAction[] = [
  {
    label: '开始设计',
    action: 'start-design',
    promptTemplate: '请为当前页面开始设计，先从数据模型开始',
  },
  {
    label: '换方案',
    action: 'alternative',
    promptTemplate: '当前方案不太合适，请提供一个替代设计方案',
  },
]

const VERIFY_ACTIONS: QuickAction[] = [
  {
    label: '自动修复',
    action: 'auto-fix',
    promptTemplate: '请根据以下错误日志自动修复页面配置：\n\n{{errorLogs}}',
  },
  {
    label: '重新生成',
    action: 'regenerate',
    promptTemplate: '请根据之前的设计决策重新生成完整的页面配置',
  },
]

// ── Stage Mode Configuration ──────────────────────────────────

export const STAGE_MODES: Record<ProjectStage, AiPanelMode> = {
  'requirements': {
    systemPrompt: REQUIREMENTS_PROMPT,
    quickActions: REQ_ACTIONS,
    proposalEnabled: false,
    autoQueryEnabled: false,
  },
  'functions': {
    systemPrompt: FUNCTION_PLANNING_PROMPT,
    quickActions: FUNC_ACTIONS,
    proposalEnabled: true,
    autoQueryEnabled: false,
  },
  'navigation': {
    systemPrompt: NAVIGATION_DESIGN_PROMPT,
    quickActions: NAV_ACTIONS,
    proposalEnabled: true,
    autoQueryEnabled: false,
  },
  'page-design': {
    // 复用 useDesignSession 中的 DESIGN_SYSTEM_PROMPT
    // 由 WorkbenchAiPanel 在初始化时注入实际 prompt
    systemPrompt: '',
    quickActions: DESIGN_ACTIONS,
    proposalEnabled: true,
    autoQueryEnabled: true,
  },
  'verification': {
    systemPrompt: ITERATION_PROMPT,
    quickActions: VERIFY_ACTIONS,
    proposalEnabled: false,
    autoQueryEnabled: false,
  },
}

// ── Context Builder ───────────────────────────────────────────

/**
 * 在模块列表中查找包含指定 pageId 的页面规划
 */
function findPagePlan(state: ProjectState): PagePlan | null {
  if (!state.activePageId) return null
  for (const mod of state.modules) {
    const page = mod.pages.find(p => p.pageId === state.activePageId)
    if (page) return page
  }
  return null
}

/**
 * 查找包含指定 pageId 的功能模块
 */
function findModule(state: ProjectState): FunctionModule | null {
  if (!state.activePageId) return null
  return state.modules.find(m => m.pages.some(p => p.pageId === state.activePageId)) ?? null
}

/**
 * 根据当前阶段和项目状态构建 AI 上下文字符串。
 * 该字符串会作为 system message 的一部分发送给 LLM。
 */
export function buildAiContext(stage: ProjectStage, state: ProjectState): string {
  switch (stage) {
    case 'requirements':
      // 纯自然语言对话，无需注入
      return ''

    case 'functions':
      // 注入已确认的需求摘要
      return state.requirements
        .filter(r => r.status === 'analyzed')
        .map(r => `需求: ${r.title}\n${r.aiSummary ?? r.description}`)
        .join('\n\n')

    case 'navigation':
      // 注入功能模块列表（AI 据此生成导航树）
      return JSON.stringify(
        state.modules.map(m => ({
          name: m.name,
          icon: m.icon,
          description: m.description,
          pages: m.pages.map(p => ({
            pageId: p.pageId,
            title: p.title,
            pageType: p.pageType,
          })),
        })),
        null,
        2,
      )

    case 'page-design': {
      const page = findPagePlan(state)
      const mod = findModule(state)
      if (!page) return ''
      return [
        `当前页面: ${page.pageId} (${page.title})`,
        `页面类型: ${page.pageType}`,
        `相关实体: ${page.dataEntities.join(', ')}`,
        `所属模块: ${mod?.name ?? '未知'}`,
        `功能描述: ${page.description}`,
      ].join('\n')
    }

    case 'verification':
      // 通过 iterate API 传递实际错误日志
      return ''
  }
}

/**
 * 构建完整的 AiWorkContext
 */
export function buildAiWorkContext(state: ProjectState): AiWorkContext {
  const stage = state.currentStage
  const mode = STAGE_MODES[stage]
  return {
    stage,
    targetId: state.activePageId ?? state.activeRequirementId,
    systemPrompt: mode.systemPrompt,
    contextData: buildAiContext(stage, state),
  }
}
