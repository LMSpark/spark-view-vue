/**
 * ProjectModel 组合根 — 构造纯领域实例。
 * 持久化由 PageContentRepository 在 ProjectEditor / PageNodeFactory 装配。
 */
import { ProjectModel } from '../model/project/model'
import type { ProjectModelInitOptions } from '../model/project/types'

/** 领域实例：projectId + 可选元数据（纯内存，无 IO）。 */
export function createBareProjectModel(options: ProjectModelInitOptions): ProjectModel {
  return new ProjectModel(options)
}
