import type { DataSetCrudTool, SparkNodeTree as SparkNodeTreeModel } from '@spark-appworks/spark-data'
import type { PageNodeFileName, PageNodeFileVersionSummary } from '../model/page/file'
import type { PageContentRepository } from '../io/page-content-repository'
import type { ConfigPageNode } from '../model/page/config-page'
import type { ProjectEditorContext } from './project-editor-context'
import type { ProjectEditorLoadOptions } from './project-editor-types'

export class PageFileEditor {
  constructor(
    private readonly ctx: ProjectEditorContext,
    private readonly repository: PageContentRepository,
    private readonly getActivePage: () => ReturnType<ProjectEditorContext['getActivePage']>,
  ) {}

  async ensureActivePageFilesLoaded(options?: ProjectEditorLoadOptions): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法加载页面文件')
    }
    const loadOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) loadOptions.forceReload = true
    await this.repository.loadPage(page, loadOptions)
  }

  async loadPageFile(name: PageNodeFileName, options?: ProjectEditorLoadOptions): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法加载页面文件')
    }
    const loadOpts = { forceReload: options?.forceReload === true }
    await this.repository.loadPageFile(page, name, loadOpts)
  }

  async savePageFile(name: PageNodeFileName): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法保存页面文件')
    }
    await this.repository.savePageFile(page, name)
  }

  async saveDirtyPageFiles(): Promise<void> {
    const page = this.getActivePage()
    if (!page) return
    await this.repository.saveDirtyPageFiles(page)
  }

  getPageFileText(name: PageNodeFileName): string {
    const page = this.getActivePage()
    if (!page) return ''
    return page.getFileText(name)
  }

  setPageFileText(name: PageNodeFileName, text: string): void {
    const page = this.requireActivePage()
    page.setFileText(name, text)
    this.notifyPageFileChanged(page.pageId, name)
  }

  canUndoPageFile(name: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    return page.canUndoFile(name)
  }

  canRedoPageFile(name: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    return page.canRedoFile(name)
  }

  undoPageFile(name: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    const ok = page.undoFile(name)
    if (ok) this.notifyPageFileChanged(page.pageId, name)
    return ok
  }

  redoPageFile(name: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    const ok = page.redoFile(name)
    if (ok) this.notifyPageFileChanged(page.pageId, name)
    return ok
  }

  isActivePageLoaded(): boolean {
    return this.getActivePage()?.isLoaded === true
  }

  getDataSetTool(): DataSetCrudTool | null {
    return this.getActivePage()?.getDataSetTool() ?? null
  }

  async editDataSet(
    run: (tool: DataSetCrudTool) => void | Promise<void>,
  ): Promise<void> {
    const page = this.requireActivePage()
    await page.editDataSet(run)
    this.notifyPageFileChanged(page.pageId, 'pagedata.json')
  }

  getNodeTree(): SparkNodeTreeModel | null {
    return this.getActivePage()?.getNodeTree() ?? null
  }

  async editNodeTree(
    run: (tree: SparkNodeTreeModel) => void | Promise<void>,
  ): Promise<void> {
    const page = this.requireActivePage()
    await page.editNodeTree(run)
    this.notifyPageFileChanged(page.pageId, 'rule.json')
  }

  private requireActivePage(): ConfigPageNode {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面')
    }
    return page
  }

  async listRemotePageVersions(filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    const page = this.getActivePage()
    if (!page) return []
    return this.repository.listFileVersions(page, filename)
  }

  async restoreRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法恢复版本')
    }
    await this.repository.restoreRemoteFileVersion(page, filename, version)
    this.notifyPageFileChanged(page.pageId, filename)
  }

  async createRemotePageVersion(filename: PageNodeFileName): Promise<void> {
    const page = this.getActivePage()
    if (!page) return
    await this.repository.createFileVersion(page, filename)
  }

  async deleteRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    const page = this.getActivePage()
    if (!page) return
    await this.repository.deleteFileVersion(page, filename, version)
  }

  notifyPageFileChanged(
    pageId: string,
    filename: PageNodeFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    this.ctx.session.bump()
    void pageId
    void filename
  }
}
