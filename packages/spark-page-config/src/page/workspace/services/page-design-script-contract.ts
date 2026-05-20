import {
  pageDesignServiceFailure,
  type PageDesignServiceResult,
} from './page-design-service-contract'

interface ScriptApiViolationRule {
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
