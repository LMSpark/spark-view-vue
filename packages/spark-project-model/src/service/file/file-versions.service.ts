/**
 * PageNode file version use case.
 *
 * 只负责页面四文件版本列表、恢复、创建快照和删除快照。
 */

import type { BasePageContentLoader } from '../content-loader/types'
import type {
  PageNodeFileApi,
  PageNodeFileVersionSummary,
} from './file-api.service'
import type { PageNodeFileName } from './file-registry.service'
import type { RuleContent } from '../../entity/content/rule.entity'
import type { DataSetContent } from '../../entity/content/dataset.entity'
import type { ScriptContent, StyleContent } from '../../entity/content/text.entity'

export type PageFileVersionTarget = {
  pageId: string
  rule: RuleContent
  dataSet: DataSetContent
  script: ScriptContent
  style: StyleContent
}

export type PageNodeRestoreFileVersionCommand = {
  page: PageFileVersionTarget
  filename: PageNodeFileName
  version: number
}

export type PageNodeFileVersionsOptions = {
  fileApi: PageNodeFileApi
  contentLoaderFactory: () => BasePageContentLoader
}

export class PageNodeFileVersions {
  private readonly fileApi: PageNodeFileApi
  private readonly contentLoaderFactory: () => BasePageContentLoader

  constructor(options: PageNodeFileVersionsOptions) {
    this.fileApi = options.fileApi
    this.contentLoaderFactory = options.contentLoaderFactory
  }

  async listVersions(pageId: string, filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    return this.fileApi.listVersions(pageId, filename)
  }

  async restoreVersion(command: PageNodeRestoreFileVersionCommand): Promise<void> {
    const { page, filename, version } = command
    const restoreCommand = {
      pageId: page.pageId,
      version,
      fileApi: this.fileApi,
      contentLoader: this.contentLoaderFactory(),
    }
    switch (filename) {
      case 'rule.json': await page.rule.restoreVersion(restoreCommand); break
      case 'pagedata.json': await page.dataSet.restoreVersion(restoreCommand); break
      case 'script.js': await page.script.restoreVersion(restoreCommand); break
      case 'style.css': await page.style.restoreVersion(restoreCommand); break
    }
  }

  async createVersion(pageId: string, filename: PageNodeFileName): Promise<void> {
    await this.fileApi.createVersion(pageId, filename)
  }

  async deleteVersion(pageId: string, filename: PageNodeFileName, version: number): Promise<void> {
    await this.fileApi.deleteVersion(pageId, filename, version)
  }
}
