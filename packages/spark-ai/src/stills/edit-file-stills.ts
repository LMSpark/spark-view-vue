/**
 * Edit — File Stills
 *
 * 编辑会话的文件读写 FC 工具。
 * catalog + 状态读写 + still 包装全部自包含，无外部子模块依赖。
 */

import type { IStillSession, StillDefinition, StillResult } from './types'
import { editingGuard, datasetExportedGuard } from './edit-guard'
import { getEditState } from './edit-state'

// ── File Catalog ─────────────────────────────────────────────

type EditFileKey = 'script' | 'style'

interface FileDescriptor {
  key: EditFileKey
  readAction: string
  writeAction: string
  label: string
}

const FILE_CATALOG: readonly FileDescriptor[] = [
  { key: 'script', readAction: 'file.readScript', writeAction: 'file.writeScript', label: 'script.js' },
  { key: 'style', readAction: 'file.readStyle', writeAction: 'file.writeStyle', label: 'style.css' },
]

// ── File State Access ────────────────────────────────────────

interface EditFileWriteParams {
  content: string
}

function validateEditFileWriteParams(params: unknown): string | null {
  const payload = params as Record<string, unknown>
  return typeof payload['content'] === 'string' ? null : '缺少 content（string）'
}

function readEditFileContent(session: IStillSession, key: EditFileKey): string {
  return getEditState(session)[key]
}

function writeEditFileContent(session: IStillSession, key: EditFileKey, content: string): void {
  getEditState(session)[key] = content
}

// ── Still Factory ────────────────────────────────────────────

function createReadStill(desc: FileDescriptor): StillDefinition {
  return {
    action: desc.readAction,
    type: 'describe',
    description: `返回 ${desc.label} 当前内容`,
    guard: editingGuard,
    validate: () => null,
    execute: (session): StillResult => {
      return {
        ok: true,
        data: { content: readEditFileContent(session, desc.key) },
        summary: `${desc.label} 内容已返回`,
      }
    },
  }
}

function createWriteStill(desc: FileDescriptor): StillDefinition {
  const still: StillDefinition<EditFileWriteParams, undefined> = {
    action: desc.writeAction,
    type: 'request',
    description: `写入 ${desc.label} 全文`,
    guard: datasetExportedGuard,
    paramsSchema: { content: `string — 完整的 ${desc.label} 内容` },
    validate: validateEditFileWriteParams,
    execute: (session, params): StillResult<undefined> => {
      writeEditFileContent(session, desc.key, params.content)
      return { ok: true, data: undefined, summary: `${desc.label} 已更新` }
    },
  }
  return still as StillDefinition
}

/**
 * 由 FILE_CATALOG 驱动，每项生成一对 read/write still。
 * 新增文件类型只需向 FILE_CATALOG 追加一行。
 */
export const EDIT_FILE_STILLS: StillDefinition[] = FILE_CATALOG.flatMap((desc) => [
  createReadStill(desc),
  createWriteStill(desc),
])
