import type { BasePageConfigLoader } from '../config/config-types'
import type { PageConfigFileApi } from '../config/page-config-file-api'

export type PageFileRestoreCommand = {
  pageId: string
  version: number
  fileApi: PageConfigFileApi
  configLoader: BasePageConfigLoader
}
