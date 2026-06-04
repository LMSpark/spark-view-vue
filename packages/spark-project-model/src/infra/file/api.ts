/**
 * PageNode file API.
 *
 * 管理 PageNode 四文件的远端写入、页面文件创建/删除和版本操作。
 * 读路径仍由 BasePageContentLoader 负责，子模型只依赖这里的写能力。
 */

import { isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'
import type { PageFileCreateOptions, PageNodeFileName, PageNodeFileVersionSummary } from '../../page/file'
import { assertNonEmptyPageId } from '../util'
import { trimTrailingSlash } from '../util'

export type PageNodeCreateFilesParams = PageFileCreateOptions & {
  pageId: string
}

export type PageNodeFileApiOptions = {
  getPageFilesApi: () => string
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

export class PageNodeFileApi {
  private readonly getPageFilesApi: () => string
  private readonly http: HttpClientBase

  constructor(options: PageNodeFileApiOptions) {
    this.getPageFilesApi = options.getPageFilesApi
    this.http = options.http
  }

  async saveFileContent(pageId: string, filename: PageNodeFileName, content: string): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.http.put<Record<string, unknown>>(
      this.fileUrl(normalizedPageId, filename),
      content,
      { headers: { 'Content-Type': 'text/plain' } },
    )
  }

  async createFiles(params: PageNodeCreateFilesParams): Promise<Record<string, unknown>> {
    const pageId = assertNonEmptyPageId(params.pageId)
    return normalizeRecordResult(await this.http.post<unknown>(`${this.baseUrl()}/__create`, { ...params, pageId }))
  }

  async deleteFiles(pageId: string): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.http.delete(`${this.baseUrl()}/${encodeURIComponent(normalizedPageId)}`)
  }

  async listVersions(pageId: string, filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const result = normalizeRecordRows(await this.http.get<unknown>(
      `${this.fileUrl(normalizedPageId, filename)}/__versions`,
    ))
    return result
      .map(normalizeVersionSummary)
      .filter((item): item is PageNodeFileVersionSummary => item !== null)
  }

  async restoreVersion(pageId: string, filename: PageNodeFileName, version: number): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    assertPositiveVersion(version)
    await this.http.post<Record<string, unknown>>(
      `${this.fileUrl(normalizedPageId, filename)}/__versions/${version}/__restore`,
      {},
    )
  }

  async createVersion(pageId: string, filename: PageNodeFileName): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.http.post<Record<string, unknown>>(
      `${this.fileUrl(normalizedPageId, filename)}/__versions`,
      {},
    )
  }

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
