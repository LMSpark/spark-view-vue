import type { PageFileName } from './page-file-documents'

export interface BackendPageVersionSummary {
  version: number
  createdAt: string
  isCurrent: boolean
  modifiedBy: string | null
}

export interface PageDesignPageFileHttpClient {
  get<T>(url: string): Promise<T>
  put<T>(url: string, body?: unknown, options?: unknown): Promise<T>
  post<T>(url: string, body?: unknown, options?: unknown): Promise<T>
  delete<T = unknown>(url: string): Promise<T>
}

export interface PageDesignPageFileApiOptions {
  getPageApi: () => string
  http: PageDesignPageFileHttpClient
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

function isOptionalPageFile(name: PageFileName): boolean {
  return name === 'script.js' || name === 'style.css'
}

function isHttpStatus(error: unknown, status: number): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false
  const candidate = error as { status?: unknown; response?: { status?: unknown } }
  return candidate.status === status || candidate.response?.status === status
}

export class PageDesignPageFileApi {
  private readonly getPageApi: () => string
  private readonly http: PageDesignPageFileHttpClient

  constructor(options: PageDesignPageFileApiOptions) {
    this.getPageApi = options.getPageApi
    this.http = options.http
  }

  async fetchFileContent(pageId: string, name: PageFileName): Promise<string> {
    try {
      const data = await this.http.get<Record<string, unknown>>(`${this.getPageApi()}/${encodeURIComponent(pageId)}/${name}`)
      const content = data['content']
      if (typeof content !== 'string') {
        throw new Error(`配置接口返回无效内容: ${pageId}/${name}`)
      }
      return content
    } catch (error) {
      if (isOptionalPageFile(name) && isHttpStatus(error, 404)) {
        return ''
      }
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`读取页面文件失败: ${pageId}/${name} (${detail})`)
    }
  }

  async saveFileContent(pageId: string, name: PageFileName, content: string): Promise<void> {
    await this.http.put<Record<string, unknown>>(
      `${this.getPageApi()}/${encodeURIComponent(pageId)}/${name}`,
      content,
      { headers: { 'Content-Type': 'text/plain' } },
    )
  }

  async listVersions(pageId: string, filename: PageFileName): Promise<BackendPageVersionSummary[]> {
    const result = await this.http.get<Array<Record<string, unknown>>>(
      `${this.getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions`,
    )
    return result
      .map((item) => ({
        version: parseOptionalNumber(item['version']) ?? 0,
        createdAt: normalizeVersionCreatedAt(item['createdAt']),
        isCurrent: Boolean(item['isCurrent']),
        modifiedBy: typeof item['modifiedBy'] === 'string' ? item['modifiedBy'] : null,
      }))
      .filter((item) => item.version > 0)
  }

  async restoreVersion(pageId: string, filename: PageFileName, version: number): Promise<void> {
    await this.http.post<Record<string, unknown>>(
      `${this.getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions/${version}/__restore`,
      {},
    )
  }

  async createVersion(pageId: string, filename: PageFileName): Promise<void> {
    await this.http.post<Record<string, unknown>>(
      `${this.getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions`,
      {},
    )
  }

  async deleteVersion(pageId: string, filename: PageFileName, version: number): Promise<void> {
    await this.http.delete(`${this.getPageApi()}/${encodeURIComponent(pageId)}/${filename}/__versions/${version}`)
  }
}
