import type { HttpClient } from '@spark-view/spark-utils'
import type { PageConfigFileName } from '../types'

export interface PageConfigFileVersionSummary {
  version: number
  createdAt: string
  isCurrent: boolean
  modifiedBy: string | null
}

export interface PageConfigPageSummary extends Record<string, unknown> {
  pageId: string
  pageType?: string
  files?: PageConfigFileName[]
}

export interface PageConfigCreatePageParams {
  pageId: string
  title?: string
  icon?: string
}

export interface PageConfigFileApiOptions {
  getPageConfigApi: () => string
  http: HttpClient
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

function assertNonEmptyPageId(pageId: string): void {
  if (pageId.trim().length === 0) {
    throw new Error('pageId must be a non-empty string')
  }
}

function assertPositiveVersion(version: number): void {
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error('version must be a positive integer')
  }
}

/**
 * 页面配置文件远程写入与版本管理 API。
 *
 * 读路径由 ConfigLoader/FileLoader 负责；写路径集中在这里，
 * 让页面配置包成为 rule/pagedata/script/style 文件 IO 的单一来源。
 */
export class PageConfigFileApi {
  private readonly getPageConfigApi: () => string
  private readonly http: HttpClient

  constructor(options: PageConfigFileApiOptions) {
    this.getPageConfigApi = options.getPageConfigApi
    this.http = options.http
  }

  async saveFileContent(pageId: string, filename: PageConfigFileName, content: string): Promise<void> {
    assertNonEmptyPageId(pageId)
    await this.http.put<Record<string, unknown>>(
      this.fileUrl(pageId, filename),
      content,
      { headers: { 'Content-Type': 'text/plain' } },
    )
  }

  async listPages(): Promise<PageConfigPageSummary[]> {
    const rows = await this.http.get<Array<Record<string, unknown>>>(`${this.baseUrl()}/__list`)
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

  async createPage(params: PageConfigCreatePageParams): Promise<Record<string, unknown>> {
    assertNonEmptyPageId(params.pageId)
    return this.http.post<Record<string, unknown>>(`${this.baseUrl()}/__create`, params)
  }

  async deletePage(pageId: string): Promise<void> {
    assertNonEmptyPageId(pageId)
    await this.http.delete(`${this.baseUrl()}/${encodeURIComponent(pageId)}`)
  }

  async listVersions(pageId: string, filename: PageConfigFileName): Promise<PageConfigFileVersionSummary[]> {
    assertNonEmptyPageId(pageId)
    const result = await this.http.get<Array<Record<string, unknown>>>(
      `${this.fileUrl(pageId, filename)}/__versions`,
    )
    return result
      .map(normalizeVersionSummary)
      .filter((item): item is PageConfigFileVersionSummary => item !== null)
  }

  async restoreVersion(pageId: string, filename: PageConfigFileName, version: number): Promise<void> {
    assertNonEmptyPageId(pageId)
    assertPositiveVersion(version)
    await this.http.post<Record<string, unknown>>(
      `${this.fileUrl(pageId, filename)}/__versions/${version}/__restore`,
      {},
    )
  }

  async createVersion(pageId: string, filename: PageConfigFileName): Promise<void> {
    assertNonEmptyPageId(pageId)
    await this.http.post<Record<string, unknown>>(
      `${this.fileUrl(pageId, filename)}/__versions`,
      {},
    )
  }

  async deleteVersion(pageId: string, filename: PageConfigFileName, version: number): Promise<void> {
    assertNonEmptyPageId(pageId)
    assertPositiveVersion(version)
    await this.http.delete(`${this.fileUrl(pageId, filename)}/__versions/${version}`)
  }

  private fileUrl(pageId: string, filename: PageConfigFileName): string {
    return `${this.baseUrl()}/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
  }

  private baseUrl(): string {
    return this.getPageConfigApi().replace(/\/+$/, '')
  }
}
