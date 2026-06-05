import { createNavigationNodeEditDto } from '../model/navigation/edit'
import type { PageNodeFileName } from '../model/page/file'
import { tryParsePageDataTextError, tryParseRuleTextError } from '../model/page/serial'
import type { ProjectEditorContext } from './project-editor-context'
import type { ProjectEditorSnapshot } from './project-editor-types'
import type { ProjectModelDto } from '../model/project/types'

export class EditorSnapshot {
  constructor(private readonly ctx: ProjectEditorContext) {}

  readSnapshot(getActivePage: () => ReturnType<ProjectEditorContext['getActivePage']>): ProjectEditorSnapshot {
    const pageId = getActivePage()?.pageId ?? ''
    const navigationRoot = this.ctx.design.navigationRoot
    const treeData = navigationRoot.children
    const selectedNodeId = this.ctx.session.session.selectedNodeId
    const selectedNode = selectedNodeId
      ? this.ctx.design.findNodeById(selectedNodeId)?.toNodeData() ?? null
      : null

    const navLocation = selectedNode
      ? this.ctx.design.findNodeLocation(selectedNode.id)
      : null

    const navEditDto = selectedNode
      ? createNavigationNodeEditDto(selectedNode)
      : null

    const activePage = getActivePage()
    const pageFeatures = this.ctx.design.readPageSummaries()

    const dirtyFiles = new Set<PageNodeFileName>()
    const parseErrors: Record<PageNodeFileName, string | null> = {
      'rule.json': null,
      'pagedata.json': null,
      'script.js': null,
      'style.css': null,
    }

    if (activePage) {
      for (const name of activePage.getDirtyFileNames()) dirtyFiles.add(name)
      parseErrors['rule.json'] = tryParseRuleTextError(activePage.getFileText('rule.json'))
      parseErrors['pagedata.json'] = tryParsePageDataTextError(
        activePage.getFileText('pagedata.json'),
        activePage.pageId,
      )
    }

    const hasAnyFileDirty = dirtyFiles.size > 0
    const navDirty = this.ctx.session.navigationDirty

    return {
      pageId,
      navigationRoot,
      treeData,
      selectedNode,
      selectedNodeId,
      navigationLocation: navLocation,
      navigationEditDto: navEditDto,
      pageFeatures,
      ruleJson: activePage?.getFileText('rule.json') ?? '',
      pageDataJson: activePage?.getFileText('pagedata.json') ?? '',
      script: activePage?.getFileText('script.js') ?? '',
      style: activePage?.getFileText('style.css') ?? '',
      dirtyFiles,
      parseErrors,
      isLoaded: activePage?.isLoaded === true,
      hasAnyFileDirty,
      navigationDirty: navDirty,
      hasAnyDirty: hasAnyFileDirty || navDirty,
    }
  }

  readProjectModelDto(): ProjectModelDto {
    return {
      projectId: this.ctx.project.projectId,
      project: this.ctx.project.projectInfo,
      navigation: this.ctx.design.navigationRoot,
      pages: this.ctx.design.readPageSummaries(),
    }
  }
}
