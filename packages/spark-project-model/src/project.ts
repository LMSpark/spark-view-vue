/**
 * @spark-appworks/spark-project-model/project
 *
 * 设计门面入口（facade/）：ProjectEditor、落盘 DTO。
 */

export type {
  NavigationNodeEditDto,
  NavigationNodeEditPatchDto,
  NavigationNodeEditApplyResultDto,
  NavigationNodeEditInputDto,
} from './model/navigation/edit'

export {
  ProjectEditor,
  createProjectEditor,
} from './facade/project-editor'

export { ProjectDesign, NavigationDesign } from './model/project/design'
export { ProjectRuntime } from './model/project/runtime'

export type {
  CreateProjectEditorOptions,
  ProjectEditorLoadOptions,
  ProjectEditorSnapshot,
  ProjectEditorSessionState,
  ProjectEditorNavigationDirtyScope,
} from './facade/project-editor'

export type {
  ProjectPageReference,
  ProjectSummary,
} from './io/reference/client'
