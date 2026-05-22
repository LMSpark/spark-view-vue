/**
 * 页面设计编辑会话核心类型与契约。
 *
 * 包含 PageDesignEditSession、编辑宿主类型以及 Service 层契约类型。
 * PageDesignService 已迁移至 page-design-service.ts。
 * PageConfigEditWorkspace / PageConfigFileLifecycle 已迁移至 page-edit-workspace.ts。
 */

import type { DataSetCrudTool } from '@spark-view/spark-data'

import type {
  SparkNodeTree,
  SparkNodeTreeMethodKey,
} from '../page/spark-node-tree'

export type { SparkNodeTreeMethodKey } from '../page/spark-node-tree'

// ── SECTION 1: 编辑会话核心 ──

export type PageDesignEditPhase = 'idle' | 'editing' | 'saved'

export class PageDesignEditSession {
  phase: PageDesignEditPhase = 'idle'

  host: PageDesignEditSession.Host | null = null

  bindHost(host: PageDesignEditSession.Host): void {
    this.host = host
  }

  getActiveNodeTree(): PageDesignEditSession.NodeTree | null {
    return this.host?.getNodeTree?.() ?? null
  }

  notifyNodeTreeChanged(nodeTree: PageDesignEditSession.NodeTree): void {
    this.host?.onNodeTreeChanged?.(nodeTree)
  }

  getActiveDataSetTool(): DataSetCrudTool | null {
    return this.host?.getDataSetTool?.() ?? null
  }

  notifyDataSetChanged(tool: DataSetCrudTool): void {
    this.host?.onDataSetChanged?.(tool)
  }
}

export namespace PageDesignEditSession {
  export type NodeTree = Pick<SparkNodeTree, SparkNodeTreeMethodKey | 'toJSON'>

  export type Host = {
    getNodeTree?: () => NodeTree | null
    onNodeTreeChanged?: (nodeTree: NodeTree) => void
    getDataSetTool?: () => DataSetCrudTool | null
    onDataSetChanged?: (tool: DataSetCrudTool) => void
    readScript?: () => string
    writeScript?: (content: string) => void
    readStyle?: () => string
    writeStyle?: (content: string) => void
  }
}

// ── SECTION 3: 服务契约类型 ──

export type PageDesignServiceContext = {
  requestId: string
  pageId: string
}

export type PageDesignServiceOptions = {
  getEditHost: (context: PageDesignServiceContext) => PageDesignEditSession.Host
}

export type PageDesignServiceResult<TResult> =
  | { ok: true; data: TResult; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

export type PageDesignTextFileKey = 'script' | 'style'

export type PageDesignServiceActionBinding<TTarget> = {
  serviceLabel: string
  run: (target: TTarget, args: unknown) => unknown
  mutates: boolean
  fixHint?: string
}

export function pageDesignServiceSuccess<TResult>(
  data: TResult,
  summary: string,
): PageDesignServiceResult<TResult> {
  return { ok: true, data, summary }
}

export function pageDesignServiceFailure(
  code: string,
  msg: string,
  fix: string,
): PageDesignServiceResult<never> {
  return { ok: false, code, msg, fix }
}

function getProp(value: object, key: string): unknown {
  const desc = Object.getOwnPropertyDescriptor(value, key)
  return desc?.value
}

export function isPageDesignServiceResult(value: unknown): value is PageDesignServiceResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  const okValue = getProp(value, 'ok')
  if (okValue === true) {
    return 'data' in value && typeof getProp(value, 'summary') === 'string'
  }
  if (okValue === false) {
    return typeof getProp(value, 'code') === 'string'
      && typeof getProp(value, 'msg') === 'string'
      && typeof getProp(value, 'fix') === 'string'
  }
  return false
}

// ── SECTION 4: 脚本运行时契约校验 ──

type ScriptApiViolationRule = {
  pattern: RegExp
  api: string
  fix: string
}

const FORBIDDEN_SCRIPT_API_RULES: readonly ScriptApiViolationRule[] = [
  {
    pattern: /\$page\.(?:getDataSet|getTableRows|getTableData|getViewData)\s*\(/,
    api: '$page 数据读取伪 API',
    fix: '使用 $dataSet?.getView("TableName", "default")?.rows 读取 DataView 行数据。',
  },
  {
    pattern: /\$page\.(?:setFieldValue|getFieldValue|setFormData|getFormData|clearForm)\s*\(/,
    api: '$page 表单/字段伪 API',
    fix: '使用 $components.getApi("component-id") 获取表单组件 API，再调用 getFormData/setFieldValue/resetFields。',
  },
  {
    pattern: /\$page\.(?:createRow|updateRow|deleteRow|refreshTable)\s*\(/,
    api: '$page CRUD/表格伪 API',
    fix: '使用 $dataSet?.getView(...).appendRow/updateRowById/deleteRowById，或 $components.getApi("table-id")?.refresh()。',
  },
  {
    pattern: /\$page\.showDialog\s*\(\s*['"`]|\$page\.hideDialog\s*\(/,
    api: '$page 组件弹窗伪 API',
    fix: '使用 $components.getApi("dialog-id")?.open() / close() 控制 r-dialog。',
  },
  {
    pattern: /\$page\.confirm\s*\(/,
    api: '$page.confirm 伪 API',
    fix: '使用 await $page.showConfirm(message, title, options) 并根据 boolean 返回值继续处理。',
  },
  {
    pattern: /\.setSummaryRow\s*\(/,
    api: 'DataView.setSummaryRow 伪 API',
    fix: 'DataView.aggregateResult 由 aggregates 自动计算；不要在 script.js 中手动 setSummaryRow。',
  },
]

export function validateScriptServiceContract(
  content: string,
): PageDesignServiceResult<undefined> | null {
  const violation = FORBIDDEN_SCRIPT_API_RULES.find((rule) => rule.pattern.test(content))
  if (violation === undefined) return null
  return pageDesignServiceFailure(
    'INVALID_SCRIPT_RUNTIME_API',
    `script.js 使用了不可用的运行时 API：${violation.api}`,
    `${violation.fix} $page 仅用于 showMessage/showConfirm/showPrompt/showAlert/showLoading/navigate 等页面服务；数据入口是 $dataSet，组件入口是 $components.getApi。`,
  )
}
