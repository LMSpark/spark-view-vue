import type { ProjectModelData, ProjectNodeData } from '../node/node-base.entity'
import {
  buildNavRoot,
  findNodeById,
  findNodeLocation,
  normalizeNavRoot,
} from '../node/node-helpers'
import type { ProjectNodeLocation } from './edit.entity'

export class NavigationEditSession {
  private rootValue: ProjectModelData = normalizeNavRoot({ title: '', childPlacement: 'header', children: [] })

  get root(): ProjectModelData {
    return this.rootValue
  }

  get children(): ProjectNodeData[] {
    return this.rootValue.children
  }

  replaceRoot(root: Partial<ProjectModelData> & { children?: ProjectNodeData[] }): ProjectModelData {
    this.rootValue = normalizeNavRoot(root)
    return this.rootValue
  }

  replaceChildren(children: ProjectNodeData[], options?: Partial<Omit<ProjectModelData, 'children'>>): ProjectModelData {
    this.rootValue = buildNavRoot(children, options)
    return this.rootValue
  }

  findNode(id: string): ProjectNodeData | null {
    return findNodeById(this.rootValue.children, id)
  }

  findLocation(id: string): ProjectNodeLocation | null {
    return findNodeLocation(this.rootValue.children, id)
  }
}
