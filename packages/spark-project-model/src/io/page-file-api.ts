/**
 * @module @spark-appworks/spark-project-model:io/page-file-api
 * 职责：提供项目模型和页面配置域中的 page file api 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * Page file API.
 *
 * 管理 PageNode 四文件的远端写入、页面文件创建/删除和版本操作。
 * 读路径由 PageContentLoader 负责，子模型只依赖这里的写能力。
 */

import { isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'
import type { PageFileCreateOptions, PageNodeFileName, PageNodeFileVersionSummary } from '../page/page-file'
import { assertNonEmptyPageId } from '../page/page-file'
import { trimTrailingSlash } from './http'

/** Page File Create Params 的语义模型。 */
export type PageFileCreateParams = PageFileCreateOptions & {
    /** page Id 标识。 */
pageId: string
}

/** Page File Api Options 的调用配置。 */
export type PageFileApiOptions = {
    /** get Page Files Api 回调。 */
getPageFilesApi: () => string
    /** http 字段。 */
http: HttpClientBase
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

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

function normalizeVersionSummary(item: Record<string, unknown>): PageNodeFileVersionSummary | null {
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

function assertPositiveVersion(version: number): void {
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error('version must be a positive integer')
  }
}

/** Page File Api 的语义模型。 */
export class PageFileApi {
  private readonly getPageFilesApi: () => string
  private readonly http: HttpClientBase

    /** 创建 Page File Api 实例。 */
constructor(options: PageFileApiOptions) {
    this.getPageFilesApi = options.getPageFilesApi
    this.http = options.http
  }

    /** 保存 File Content。 */
async saveFileContent(pageId: string, filename: PageNodeFileName, content: string): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.http.put<Record<string, unknown>>(
      this.fileUrl(normalizedPageId, filename),
      content,
      { headers: { 'Content-Type': 'text/plain' } },
    )
  }

    /** 创建 Files。 */
async createFiles(params: PageFileCreateParams): Promise<Record<string, unknown>> {
    const pageId = assertNonEmptyPageId(params.pageId)
    return normalizeRecordResult(await this.http.post<unknown>(`${this.baseUrl()}/__create`, { ...params, pageId }))
  }

    /** 删除 Files。 */
async deleteFiles(pageId: string): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.http.delete(`${this.baseUrl()}/${encodeURIComponent(normalizedPageId)}`)
  }

    /** 执行 list Versions 操作。 */
async listVersions(pageId: string, filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const result = normalizeRecordRows(await this.http.get<unknown>(
      `${this.fileUrl(normalizedPageId, filename)}/__versions`,
    ))
    return result
      .map(normalizeVersionSummary)
      .filter((item): item is PageNodeFileVersionSummary => item !== null)
  }

    /** 执行 restore Version 操作。 */
async restoreVersion(pageId: string, filename: PageNodeFileName, version: number): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    assertPositiveVersion(version)
    await this.http.post<Record<string, unknown>>(
      `${this.fileUrl(normalizedPageId, filename)}/__versions/${version}/__restore`,
      {},
    )
  }

    /** 创建 Version。 */
async createVersion(pageId: string, filename: PageNodeFileName): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.http.post<Record<string, unknown>>(
      `${this.fileUrl(normalizedPageId, filename)}/__versions`,
      {},
    )
  }

    /** 删除 Version。 */
async deleteVersion(pageId: string, filename: PageNodeFileName, version: number): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    assertPositiveVersion(version)
    await this.http.delete(`${this.fileUrl(normalizedPageId, filename)}/__versions/${version}`)
  }

  private fileUrl(pageId: string, filename: PageNodeFileName): string {
    return `${this.baseUrl()}/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
  }

  private baseUrl(): string {
    return trimTrailingSlash(this.getPageFilesApi())
  }
}
