/**
 * 页面配置文件远程 API。
 *
 * 负责页面配置的写路径：文件内容写入、页面 CRUD、版本管理。
 * 读路径由 BasePageConfigLoader / FileLoader 负责。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组（按远程 API 操作类型）                       │
 * │                                                      │
 * │  1. 摘要类型： PageConfigFileVersionSummary           │
 * │               PageConfigPageSummary                   │
 * │  2. 参数类型： PageConfigCreatePageParams             │
 * │               PageConfigFileApiOptions                │
 * │  3. API 类：   PageConfigFileApi                      │
 * │     - 文件写入：saveFileContent()                     │
 * │     - 页面 CRUD：listPages() / createPage()           │
 * │                  deletePage()                         │
 * │     - 版本管理：listVersions() / createVersion()      │
 * │                  restoreVersion() / deleteVersion()   │
 * └──────────────────────────────────────────────────────┘
 */

import { isRecord, type HttpClientBase } from '@spark-view/spark-utils'
import type { PageConfigFileName } from './config-types'

// ═══════════════════════════════════════════════════════
// 1. 摘要类型
//
// 远程 API 返回的页面和版本信息，用于列表展示。
// ═══════════════════════════════════════════════════════

/** 页面配置版本摘要：用于版本列表展示 */
export type PageConfigFileVersionSummary = {
  /** 版本号（正整数） */
  version: number
  /** 创建时间（ISO 8601 字符串） */
  createdAt: string
  /** 是否为当前生效版本 */
  isCurrent: boolean
  /** 修改人标识 */
  modifiedBy: string | null
}

/** 页面配置摘要：用于页面列表展示 */
export type PageConfigPageSummary = Record<string, unknown> & {
  /** 页面 ID */
  pageId: string
  /** 页面类型（可选） */
  pageType?: string
  /** 已存在的配置文件列表 */
  files?: PageConfigFileName[]
}

// ═══════════════════════════════════════════════════════
// 2. 参数类型
// ═══════════════════════════════════════════════════════

/** 创建页面时的输入参数 */
export type PageConfigCreatePageParams = {
  /** 页面 ID */
  pageId: string
  /** 页面标题（可选） */
  title?: string
  /** 页面图标（可选） */
  icon?: string
}

/** PageConfigFileApi 构造选项 */
export type PageConfigFileApiOptions = {
  /** 获取页面配置 API 基础地址的函数（支持动态解析当前项目作用域） */
  getPageConfigApi: () => string
  /** HTTP 客户端实例 */
  http: HttpClientBase
}

// ═══════════════════════════════════════════════════════
// 3. 输入值归一化
//
// 远程 API 返回的数据类型不固定，需要在这里做清洗。
// ═══════════════════════════════════════════════════════

/** 尝试将未知值解析为有限数值；失败时返回 null */
function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** 将未知时间值统一为 ISO 字符串；无法解析时返回空字符串 */
function normalizeVersionCreatedAt(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  return ''
}

/** 将远程版本行数据归一化为 PageConfigFileVersionSummary */
function normalizeVersionSummary(item: Record<string, unknown>): PageConfigFileVersionSummary | null {
  const version = parseOptionalNumber(item['version']) ?? 0
  if (version <= 0) return null
  return {
    version,
    createdAt: normalizeVersionCreatedAt(item['createdAt']),
    isCurrent: item['isCurrent'] === true,
    modifiedBy: typeof item['modifiedBy'] === 'string' ? item['modifiedBy'] : null,
  }
}

function readEnvelopeData(value: unknown): unknown {
  if (!isRecord(value)) return value
  if (value['ok'] === true && Object.prototype.hasOwnProperty.call(value, 'data')) {
    return value['data']
  }
  return value
}

function normalizeRecordRows(value: unknown): Array<Record<string, unknown>> {
  const data = readEnvelopeData(value)
  return Array.isArray(data) ? data.filter(isRecord) : []
}

function normalizeRecordResult(value: unknown): Record<string, unknown> {
  const data = readEnvelopeData(value)
  return isRecord(data) ? data : {}
}

// ═══════════════════════════════════════════════════════
// 4. 参数断言
//
// fail-fast 阻止无效输入到达 HTTP 层。
// ═══════════════════════════════════════════════════════

/** 断言 pageId 是非空字符串 */
function assertNonEmptyPageId(pageId: string): string {
  const normalized = pageId.trim()
  if (normalized.length === 0) {
    throw new Error('pageId must be a non-empty string')
  }
  return normalized
}

/** 断言 version 是正整数 */
function assertPositiveVersion(version: number): void {
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error('version must be a positive integer')
  }
}

// ═══════════════════════════════════════════════════════
// 5. API 类
//
// 页面配置文件远程写入与版本管理的统一入口。
// ═══════════════════════════════════════════════════════

/**
 * 页面配置文件远程 API。
 *
 * 写路径集中在该类中，与读路径（BasePageConfigLoader / FileLoader）
 * 共同构成页面配置 IO 的单一来源。
 */
export class PageConfigFileApi {
  private readonly getPageConfigApi: () => string
  private readonly http: HttpClientBase

  constructor(options: PageConfigFileApiOptions) {
    this.getPageConfigApi = options.getPageConfigApi
    this.http = options.http
  }

  // ── 文件写入 ──

  /** 保存页面某个文件的内容到远程 */
  async saveFileContent(pageId: string, filename: PageConfigFileName, content: string): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.http.put<Record<string, unknown>>(
      this.fileUrl(normalizedPageId, filename),
      content,
      { headers: { 'Content-Type': 'text/plain' } },
    )
  }

  // ── 页面 CRUD ──

  /** 获取所有页面的摘要列表 */
  async listPages(): Promise<PageConfigPageSummary[]> {
    const rows = normalizeRecordRows(await this.http.get<unknown>(`${this.baseUrl()}/__list`))
    return rows
      .map((row): PageConfigPageSummary | null => {
        const pageId = row['pageId']
        if (typeof pageId !== 'string' || pageId.trim() === '') return null
        return {
          ...row,
          pageId,
          ...(typeof row['pageType'] === 'string' ? { pageType: row['pageType'] } : {}),
          ...(Array.isArray(row['files'])
            ? {
                files: row['files'].filter(
                  (name): name is PageConfigFileName => typeof name === 'string',
                ),
              }
            : {}),
        }
      })
      .filter((row): row is PageConfigPageSummary => row !== null)
  }

  /** 创建新页面（四文件骨架） */
  async createPage(params: PageConfigCreatePageParams): Promise<Record<string, unknown>> {
    const pageId = assertNonEmptyPageId(params.pageId)
    return normalizeRecordResult(await this.http.post<unknown>(`${this.baseUrl()}/__create`, { ...params, pageId }))
  }

  /** 删除页面及其所有文件 */
  async deletePage(pageId: string): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.http.delete(`${this.baseUrl()}/${encodeURIComponent(normalizedPageId)}`)
  }

  // ── 版本管理 ──

  /** 获取某个页面文件的全部版本列表 */
  async listVersions(pageId: string, filename: PageConfigFileName): Promise<PageConfigFileVersionSummary[]> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const result = normalizeRecordRows(await this.http.get<unknown>(
      `${this.fileUrl(normalizedPageId, filename)}/__versions`,
    ))
    return result
      .map(normalizeVersionSummary)
      .filter((item): item is PageConfigFileVersionSummary => item !== null)
  }

  /** 恢复页面文件到指定版本 */
  async restoreVersion(pageId: string, filename: PageConfigFileName, version: number): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    assertPositiveVersion(version)
    await this.http.post<Record<string, unknown>>(
      `${this.fileUrl(normalizedPageId, filename)}/__versions/${version}/__restore`,
      {},
    )
  }

  /** 为页面文件创建当前内容的新版本快照 */
  async createVersion(pageId: string, filename: PageConfigFileName): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.http.post<Record<string, unknown>>(
      `${this.fileUrl(normalizedPageId, filename)}/__versions`,
      {},
    )
  }

  /** 删除页面文件的指定版本 */
  async deleteVersion(pageId: string, filename: PageConfigFileName, version: number): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    assertPositiveVersion(version)
    await this.http.delete(`${this.fileUrl(normalizedPageId, filename)}/__versions/${version}`)
  }

  // ── 内部辅助 ──

  /** 拼接页面文件的远程 URL */
  private fileUrl(pageId: string, filename: PageConfigFileName): string {
    return `${this.baseUrl()}/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
  }

  /** 获取页面配置 API 基础地址（去除尾部斜杠） */
  private baseUrl(): string {
    return this.getPageConfigApi().replace(/\/+$/, '')
  }
}
