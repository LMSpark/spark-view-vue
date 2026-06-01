import type { BasePageContentLoader } from '../content-loader/types'
import type { PageNodeFileApi } from './file-api.service'

export type PageFileRestoreCommand = {
  pageId: string
  version: number
  fileApi: PageNodeFileApi
  contentLoader: BasePageContentLoader
}
