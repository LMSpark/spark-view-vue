import type {
  PageContentLoadResult,
  PageFileCache,
  PageFileContentLoader,
  PageFileWriter,
} from '../page/file'

/** 持久化端口类型（由 PageContentRepository 在组合根注入）。 */
export type ProjectModelIoPorts = {
  readonly fileApi: PageFileWriter
  readonly fileCache: PageFileCache
  readonly contentLoaderFactory: () => PageFileContentLoader
}

/** 测试与 headless 场景用的内存 no-op 端口。 */
export function createInMemoryProjectModelIoPorts(): ProjectModelIoPorts {
  const emptyLoaderResult: PageContentLoadResult<string> = { success: true, data: '' }
  const loader: PageFileContentLoader = {
    loadPageFileContent: () => Promise.resolve(emptyLoaderResult),
    getHttpClient: () => undefined,
  }
  return {
    fileApi: {
      createFiles: () => Promise.resolve({}),
      deleteFiles: () => Promise.resolve(),
      saveFileContent: () => Promise.resolve(),
      listVersions: () => Promise.resolve([]),
      restoreVersion: () => Promise.resolve(),
      createVersion: () => Promise.resolve(),
      deleteVersion: () => Promise.resolve(),
    },
    fileCache: { clearPageCache: () => {} },
    contentLoaderFactory: () => loader,
  }
}
