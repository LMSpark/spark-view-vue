import { createPageModelFunction, pageModelToolFailure, type PageModelToolFamily } from './tool-contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function contentArg(args: unknown): string {
  if (!isRecord(args)) throw new Error('参数必须是对象。')
  const content = args['content']
  if (typeof content !== 'string') throw new Error('缺少 content（string）。')
  return content
}

const FORBIDDEN_SCRIPT_API_RULES: ReadonlyArray<{ pattern: RegExp; api: string; fix: string }> = [
  {
    pattern: /\$page\.(?:getDataSet|getTableRows|getTableData|getViewData)\s*\(/,
    api: '$page 数据读取伪 API',
    fix: '使用 $dataSet 与 $components 入口，不要在 script.js 中调用旧 $page 数据伪 API。',
  },
  {
    pattern: /\.setSummaryRow\s*\(/,
    api: 'DataView.setSummaryRow 伪 API',
    fix: 'DataView aggregateResult 由 aggregates 自动计算，不要手动 setSummaryRow。',
  },
]

function validateScriptRuntimeContract(content: string) {
  const violation = FORBIDDEN_SCRIPT_API_RULES.find((rule) => rule.pattern.test(content))
  if (violation === undefined) return null
  return pageModelToolFailure({
    code: 'INVALID_SCRIPT_RUNTIME_API',
    msg: `script.js 使用了不可用的运行时 API：${violation.api}`,
    fix: violation.fix,
  })
}

export function createTextModelToolFamily(): PageModelToolFamily {
  return {
    name: 'textModel',
    title: '文本模型工具',
    description: '负责 script.js 与 style.css 的整文件读写。',
    rules: ['textModel 只处理文本文件；rule.json 和 pagedata.json 分别归 sparkNodeTree / datasetTool。'],
    functions: [
      createPageModelFunction({
        action: 'textModel.readScript',
        type: 'describe',
        description: '读取当前 PageModelHost 上的 script.js 文本。',
        paramsSchema: {},
        execute: ({ host }) => ({ content: host.readFile('script.js') }),
      }),
      createPageModelFunction({
        action: 'textModel.writeScript',
        type: 'request',
        description: '整文件写入当前 PageModelHost 上的 script.js 文本。',
        paramsSchema: { content: 'string — 完整 script.js 内容' },
        persistAfterExecute: 'success',
        execute: ({ host, args }) => {
          const content = contentArg(args)
          const contractError = validateScriptRuntimeContract(content)
          if (contractError !== null) return contractError
          host.writeFile('script.js', content)
          return { updated: 'script.js' }
        },
      }),
      createPageModelFunction({
        action: 'textModel.readStyle',
        type: 'describe',
        description: '读取当前 PageModelHost 上的 style.css 文本。',
        paramsSchema: {},
        execute: ({ host }) => ({ content: host.readFile('style.css') }),
      }),
      createPageModelFunction({
        action: 'textModel.writeStyle',
        type: 'request',
        description: '整文件写入当前 PageModelHost 上的 style.css 文本。',
        paramsSchema: { content: 'string — 完整 style.css 内容' },
        persistAfterExecute: 'success',
        execute: ({ host, args }) => {
          host.writeFile('style.css', contentArg(args))
          return { updated: 'style.css' }
        },
      }),
    ],
  }
}
