/**
 * StyleCss Capability Catalog
 *
 * 为 StyleCss.pageScope / StyleCss.elementPlus / StyleCss.layout 三个 capabilityId 提供结构化知识，
 * 作为 stills.actionSpec / session.describe 的事实源。
 *
 * 约束：
 * - 本文件只提供 catalog，不提供 execute 实现；
 * - 条目结构对齐 DataSetCrudTool / SparkNodeTree catalog 的 failureModes 形状（code/when/fix）。
 */

/** 通用失败模式。 */
export interface StyleCssFailureMode {
  code: string
  when: string
  fix: string
}

/** StyleCss 能力条目。 */
export interface StyleCssCapabilityEntry {
  capabilityId: string
  description: string
  paramsSchema: Record<string, unknown>
  usageRules: string[]
  failureModes: StyleCssFailureMode[]
}

export const STYLE_CSS_CAPABILITY_ENTRIES: readonly StyleCssCapabilityEntry[] = [
  {
    capabilityId: 'StyleCss.pageScope',
    description: '页面级 CSS 作用域 — 框架自动为 style.css 添加页面隔离前缀',
    paramsSchema: {
      selector: 'CSS 选择器 — 直接写即可，框架自动添加 .spark-page-[pageId] 作用域前缀',
      _说明: '不需要手动添加页面作用域前缀，框架自动处理。直接写全局样式，框架会自动包裹。',
    },
    usageRules: [
      '不需要手动添加页面作用域前缀（.spark-page-xxx），框架自动处理',
      '直接写全局样式即可，框架会自动包裹到页面作用域',
      'CSS 类名应与 rule.json 中组件的 class 属性一致',
      'rule.json 中引用的 CSS class 必须在 style.css 中定义',
    ],
    failureModes: [
      { code: 'STYLE_CLASS_MISMATCH', when: 'rule.json 使用了 class 但 style.css 中未定义对应样式', fix: '确保 rule.json 中的 class 值在 style.css 中有对应的选择器' },
    ],
  },
  {
    capabilityId: 'StyleCss.elementPlus',
    description: 'Element Plus 组件样式覆盖 — 通过 CSS 自定义属性覆盖主题',
    paramsSchema: {
      '--el-color-primary': 'string — 主题色（默认 #409eff）',
      '--el-color-success': 'string — 成功色',
      '--el-color-warning': 'string — 警告色',
      '--el-color-danger': 'string — 危险色',
      '--el-color-info': 'string — 信息色',
      '--el-border-radius-base': 'string — 基础圆角',
      '--el-font-size-base': 'string — 基础字号',
      '--el-fill-color-blank': 'string — 空白填充色',
      _使用方式: '在 :root 或页面容器选择器上声明覆盖变量',
    },
    usageRules: [
      '通过 CSS 自定义属性（--el-* 变量）覆盖 Element Plus 默认主题',
      '在 :root 或页面容器选择器中声明变量',
      '常用变量：--el-color-primary、--el-border-radius-base、--el-font-size-base',
      '避免直接覆盖 Element Plus 内部类名（优先用 CSS 变量）',
    ],
    failureModes: [
      { code: 'STYLE_VAR_TYPO', when: 'CSS 变量名拼写错误（如 --el-color-primay）', fix: '检查 Element Plus 官方文档确认正确的变量名' },
    ],
  },
  {
    capabilityId: 'StyleCss.layout',
    description: '布局工具类 — flex / grid / gap / padding 等布局模式',
    paramsSchema: {
      display: '"flex" | "grid" | "block" — 布局模式',
      'flex-direction': '"row" | "column" — flex 主轴方向',
      gap: 'string — 元素间距（如 "8px"、"16px"）',
      padding: 'string — 内边距',
      'grid-template-columns': 'string — grid 列定义',
      height: '"100vh" | "100%" | string — 页面高度（根容器常用 100vh）',
    },
    usageRules: [
      '使用 flexbox 或 CSS Grid 布局',
      '间距优先使用 gap 属性',
      '避免 !important（除非覆盖第三方样式）',
      '根容器常用 display: flex; height: 100vh; 实现全屏布局',
      '左右分栏布局：左侧固定宽度 + 右侧 flex: 1',
    ],
    failureModes: [
      { code: 'LAYOUT_OVERFLOW', when: '子元素溢出父容器', fix: '检查父容器是否设置了 overflow: hidden/auto，或子容器高度是否超出 100vh' },
    ],
  },
] as const satisfies readonly StyleCssCapabilityEntry[]

export function getStyleCssCapabilityEntry(capabilityId: string): StyleCssCapabilityEntry | undefined {
  return STYLE_CSS_CAPABILITY_ENTRIES.find(e => e.capabilityId === capabilityId)
}
