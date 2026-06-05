import type { ProjectModel } from '../model/project/model'
import type { ProjectDesign } from '../model/project/design'
import type { ProjectNodeData } from '../model/navigation/node'
import type { ConfigPageNode } from '../model/page/config-page'
import type { EditorSession } from './editor-session'

/** ProjectEditor 协作者共享的只读上下文与选中节点辅助。 */
export class ProjectEditorContext {
  constructor(
    readonly project: ProjectModel,
    readonly session: EditorSession,
  ) {}

  get design(): ProjectDesign {
    return this.project.design
  }

  getSelectedNode(): ProjectNodeData | null {
    const selectedNodeId = this.session.session.selectedNodeId
    if (!selectedNodeId) return null
    return this.design.findNodeById(selectedNodeId)?.toNodeData() ?? null
  }

  requireSelectedNode(message: string): ProjectNodeData {
    const node = this.getSelectedNode()
    if (node) return node
    throw new Error(message)
  }

  getActivePage(): ConfigPageNode | null {
    const activePageId = this.session.session.activePageId
    if (!activePageId) return null
    return this.design.findConfigPageByPageId(activePageId)
  }

  openPage(pageId: string): ConfigPageNode {
    const normalized = pageId.trim()
    if (!normalized) {
      throw new Error('pageId 不能为空')
    }
    return this.design.openConfigPage(normalized)
  }

  closePage(pageId: string): void {
    this.design.closeConfigPage(pageId)
  }

  refreshNavRefs(): void {
    this.design.refreshNavRefs()
  }
}
