/**
 * Edit — File Stills
 *
 * 编辑会话的文件读写 FC 工具。
 * catalog + 状态读写 + still 包装全部自包含，无外部子模块依赖。
 */

import type { IStillSession, StillDefinition, StillResult } from '../types'
import {
  getEditState,
  readActiveScript,
  writeActiveScript,
  readActiveStyle,
  writeActiveStyle,
} from '../edit-state'
import {
  TEXT_MODEL_READ_SCRIPT_ACTION,
  TEXT_MODEL_WRITE_SCRIPT_ACTION,
  TEXT_MODEL_READ_STYLE_ACTION,
  TEXT_MODEL_WRITE_STYLE_ACTION,
} from '../action-names'

// ─────────────────────────────────────────────────────────────────────────────
// 类型与文件目录
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 当前编辑域内可直接读写的文本文件键。
 *
 * 这里不包含 rule.json / pagedata.json：
 * - rule.json 走 nodeTree 相关 still；
 * - pagedata.json 走 datasetTool.* / dataset.export 链路。
 *
 * 本模块只负责 script.js 与 style.css 这两类“全文本”文件。
 */
type EditFileKey = 'script' | 'style'

/**
 * 文件目录项描述。
 *
 * 每一项同时定义：
 * 1. state 中对应的字段 key；
 * 2. 对外暴露的读动作名；
 * 3. 对外暴露的写动作名；
 * 4. 用户可见的文件标签。
 *
 * 这样 read/write still 都可以从同一份 catalog 自动投影，
 * 不需要分别手写两套动作定义。
 */
interface FileDescriptor {
  key: EditFileKey
  readActions: string[]
  writeActions: string[]
  label: string
}

/**
 * 文件目录。
 *
 * 设计意图：
 * 1. 让文件种类成为单一真实源；
 * 2. 新增文本文件时只需追加一行；
 * 3. 动作名统一来自 action-names，避免散落字符串常量。
 */
const FILE_CATALOG: readonly FileDescriptor[] = [
  {
    key: 'script',
    readActions: [TEXT_MODEL_READ_SCRIPT_ACTION],
    writeActions: [TEXT_MODEL_WRITE_SCRIPT_ACTION],
    label: 'script.js',
  },
  {
    key: 'style',
    readActions: [TEXT_MODEL_READ_STYLE_ACTION],
    writeActions: [TEXT_MODEL_WRITE_STYLE_ACTION],
    label: 'style.css',
  },
]

function ensureTextModelReadable(session: IStillSession, key: EditFileKey): string | null {
  const state = getEditState(session)
  if (key === 'script') {
    return typeof state.liveModelAdapter?.readScript === 'function' ? null : '缺少 live text model: readScript'
  }
  return typeof state.liveModelAdapter?.readStyle === 'function' ? null : '缺少 live text model: readStyle'
}

function ensureTextModelWritable(session: IStillSession, key: EditFileKey): string | null {
  const state = getEditState(session)
  if (key === 'script') {
    return typeof state.liveModelAdapter?.writeScript === 'function' ? null : '缺少 live text model: writeScript'
  }
  return typeof state.liveModelAdapter?.writeStyle === 'function' ? null : '缺少 live text model: writeStyle'
}

// ─────────────────────────────────────────────────────────────────────────────
// 参数模型与状态访问
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 写文件 still 的统一入参。
 *
 * 本模块采用“整文件覆盖”语义，而不是局部 patch：
 * 调用方必须传入完整文本内容，状态层直接替换对应字段。
 */
interface EditFileWriteParams {
  content: string
}

/**
 * 校验写文件入参。
 *
 * 约束非常简单：必须提供字符串类型的 content。
 * 空字符串是允许的，因为 script/style 可能合法地被清空。
 */
function validateEditFileWriteParams(params: unknown): string | null {
  const payload = params as Record<string, unknown>
  return typeof payload['content'] === 'string' ? null : '缺少 content（string）'
}

/**
 * 读取编辑态中的文件全文。
 *
 * edit-state 已把 script/style 直接保存在 state 上，
 * 这里按 key 透传，避免外层 still 直接接触状态字段名。
 */
function readEditFileContent(session: IStillSession, key: EditFileKey): string {
  const state = getEditState(session)
  return key === 'script'
    ? readActiveScript(state)
    : readActiveStyle(state)
}

/**
 * 写回编辑态中的文件全文。
 *
 * 该函数只做状态替换，不负责差异计算、导出或阶段推进；
 * 这些职责分别由 diff/export 模块处理，避免本文件职责膨胀。
 */
function writeEditFileContent(session: IStillSession, key: EditFileKey, content: string): void {
  const state = getEditState(session)
  if (key === 'script') {
    writeActiveScript(state, content)
    return
  }
  writeActiveStyle(state, content)
}

// ─────────────────────────────────────────────────────────────────────────────
// Still 工厂
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 为单个目录项创建“读文件” still。
 *
 * 行为：
 * 1. 直接返回当前缓存中的全文；
 * 2. 不修改任何状态。
 */
function createReadStill(desc: FileDescriptor, action: string): StillDefinition {
  return {
    action,
    type: 'describe',
    description: `返回 ${desc.label} 当前文本模型内容`,
    validate: () => null,
    execute: (session): StillResult => {
      const readableError = ensureTextModelReadable(session, desc.key)
      if (readableError) {
        return {
          ok: false,
          code: 'NO_TEXT_MODEL',
          msg: readableError,
          fix: '请先执行 edit.bootstrap 初始化编辑会话，并确保宿主绑定 EditLiveModelAdapter.read*/write*',
        }
      }
      return {
        ok: true,
        data: { content: readEditFileContent(session, desc.key) },
        summary: `${desc.label} 内容已返回`,
      }
    },
  }
}

/**
 * 为单个目录项创建“写文件” still。
 *
 * 写入语义是“整文件覆盖”，不额外引入阶段 guard。
 */
function createWriteStill(desc: FileDescriptor, action: string): StillDefinition {
  const still: StillDefinition<EditFileWriteParams, undefined> = {
    action,
    type: 'request',
    description: `写入 ${desc.label} 文本模型全文`,
    paramsSchema: { content: `string — 完整的 ${desc.label} 文本模型内容` },
    validate: validateEditFileWriteParams,
    execute: (session, params): StillResult<undefined> => {
      const writableError = ensureTextModelWritable(session, desc.key)
      if (writableError) {
        return {
          ok: false,
          code: 'NO_TEXT_MODEL',
          msg: writableError,
          fix: '请先执行 edit.bootstrap 初始化编辑会话，并确保宿主绑定 EditLiveModelAdapter.read*/write*',
        }
      }
      writeEditFileContent(session, desc.key, params.content)
      return { ok: true, data: undefined, summary: `${desc.label} 已更新` }
    },
  }
  return still as StillDefinition
}

// ─────────────────────────────────────────────────────────────────────────────
// catalog → StillDefinition 投影
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 由 FILE_CATALOG 驱动，每项生成一对 read/write still。
 *
 * 结果特点：
 * 1. 每个文件生成一对动作：read + write；
 * 2. still 顺序与 catalog 顺序一致，便于目录理解；
 * 3. 新增文件类型只需向 FILE_CATALOG 追加一行。
 */
export const EDIT_FILE_STILLS: StillDefinition[] = FILE_CATALOG.flatMap((desc) => [
  ...desc.readActions.map((action) => createReadStill(desc, action)),
  ...desc.writeActions.map((action) => createWriteStill(desc, action)),
])
