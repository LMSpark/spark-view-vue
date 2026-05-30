import type { BasePageContentLoader } from '../read/page-content-types'
import type { PageNodeFileApi } from './page-file-api'

export type PageFileRestoreCommand = {
  pageId: string
  version: number
  fileApi: PageNodeFileApi
  contentLoader: BasePageContentLoader
}
