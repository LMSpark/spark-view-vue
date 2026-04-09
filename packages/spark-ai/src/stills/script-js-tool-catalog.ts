/**
 * ScriptJs Capability Catalog
 *
 * 为 ScriptJs.sandbox 和 ScriptJs.init 两个 capabilityId 提供结构化知识，
 * 作为 generate-tools-catalog.ts queryActionSpec 的事实源。
 *
 * 约束：
 * - 本文件只提供 catalog，不提供 execute 实现；
 * - 条目结构对齐 DataSetCrudTool / SparkNodeTree catalog 的 failureModes 形状（code/when/fix）。
 */

/** 通用失败模式。 */
export interface ScriptJsFailureMode {
  code: string
  when: string
  fix: string
}

/** ScriptJs 能力条目。 */
export interface ScriptJsCapabilityEntry {
  capabilityId: string
  description: string
  paramsSchema: Record<string, unknown>
  usageRules: string[]
  failureModes: ScriptJsFailureMode[]
}

export const SCRIPT_JS_CAPABILITY_ENTRIES: readonly ScriptJsCapabilityEntry[] = [
  {
    capabilityId: 'ScriptJs.sandbox',
    description: 'script.js 沙箱执行环境 — 注入变量与约束规则',
    paramsSchema: {
      $dataSet: 'IDataSet | null — 页面级 DataSet（数据唯一入口）',
      $page: 'IPageServiceCapability — UI 消息（showMessage/showConfirm/showPrompt/showAlert）、导航、加载遮罩、弹层（showDialog）、文件浏览、文件上传',
      $route: 'IPageRoute — 当前路由快照（path, params, query, name），框架无关接口',
      $refreshData: '(key?) => Promise<void> — 刷新数据（可选指定表名）',
      $el: '() => HTMLElement | null — 页面容器元素',
      $query: '(sel) => HTMLElement | null — DOM 单元素查询',
      $queryAll: '(sel) => NodeListOf<Element> — DOM 多元素查询',
      h: 'Vue h 函数 — 渲染函数专用（Render* 函数内使用）',
      permission: '权限 helper 命名空间 — isPermittedAction / resolveFieldPermissionState / formatPermissionAwareFieldValue 等',
      SparkData: 'SparkData 命名空间 — createTreeManager 等工具',
    },
    usageRules: [
      '禁止使用 import 语句（沙箱不支持 ESM）',
      '禁止使用 ElMessage / ElMessageBox — 用 $page.showMessage / showConfirm / showPrompt / showAlert',
      '禁止使用 window.xxx = function — 直接 function xxx() {} 声明',
      '禁止使用 $data — 已移除，用 $dataSet',
      '禁止使用 window.Vue — h 已直接注入',
      '禁止在 view.setCurrentRow(row) 的 currentChange 回调中调用 — 框架已自动处理',
      'UI 状态用模块级闭包变量 _pageState（普通 JS 对象，非 Vue 响应式）',
      '数据操作通过 $dataSet.getView(tableName, viewId) 获取 DataView',
      '变更后若需 UI 刷新：DOM 直写（$query + innerHTML）或 DataView.replaceRows()（自动触发 UI 更新）',
      'Render* 函数用 h() 返回 VNode，函数名必须与 rule.json 中的 type 匹配',
    ],
    failureModes: [
      { code: 'SANDBOX_IMPORT', when: '使用了 import 语句', fix: '所有依赖通过沙箱注入，不支持 ESM' },
      { code: 'SANDBOX_ELMESSAGE', when: '使用了 ElMessage 或 ElMessageBox', fix: '改用 $page.showMessage(msg, type) / $page.showConfirm(msg)' },
      { code: 'SANDBOX_WINDOW_FUNC', when: '使用了 window.xxx = function 挂载函数', fix: '直接 function xxx() {} 声明' },
      { code: 'SANDBOX_DATA_REMOVED', when: '使用了 $data', fix: '$data 已移除，数据用 $dataSet，UI 状态用 _pageState 闭包变量' },
      { code: 'SANDBOX_VUE_IMPORT', when: '使用了 window.Vue', fix: 'h 已直接注入沙箱，直接使用 h(...)' },
    ],
  },
  {
    capabilityId: 'ScriptJs.init',
    description: '__init__ 页面入口函数 — 框架在渲染器挂载完成后自动调用',
    paramsSchema: {
      __init__: 'function — 页面入口函数，渲染器挂载完成后自动调用',
      _执行时序: '编译脚本 → initDataSet → rebindRules → loading=false → 渲染器 mounted → __init__() → initAutoSelection()',
    },
    usageRules: [
      '__init__ 只执行一次（页面首次加载时），页面内导航不会重复执行',
      '在 __init__ 中 $dataSet 已就绪，可订阅事件、操作数据',
      '在 __init__ 中订阅 DataView 事件（如 currentRowChanged），确保能收到 initAutoSelection 触发的初始事件',
      '在 __init__ 中根据 $route.query / $route.params 加载数据',
      '在 __init__ 中初始化 UI 状态（如隐藏高级面板）',
      'dataSet.on("loadSuccess") 只会被有 api.list 配置的表触发，内联数据表不触发',
    ],
    failureModes: [
      { code: 'INIT_MISSING', when: '未定义 __init__ 函数', fix: '添加 function __init__() { ... }' },
      { code: 'INIT_LOAD_EVENT_GUARD', when: 'loadSuccess 回调中未过滤内联表', fix: '在 loadSuccess 回调中加 if (!table?.api?.list) return' },
    ],
  },
] as const satisfies readonly ScriptJsCapabilityEntry[]

export function getScriptJsCapabilityEntry(capabilityId: string): ScriptJsCapabilityEntry | undefined {
  return SCRIPT_JS_CAPABILITY_ENTRIES.find(e => e.capabilityId === capabilityId)
}
