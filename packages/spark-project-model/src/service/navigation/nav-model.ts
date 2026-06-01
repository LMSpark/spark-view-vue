/**
 * 导航模型类型 — 从 spark-data 委托 re-export。
 *
 * 纯数据模型类型的 SSOT 在 @spark-view/spark-data。
 * 本文件是导航服务层的单一导入点，禁止从业务层绕过它直连底层包。
 */

export type {
  AppModuleBase,
  AppNavRoot,
  AppNavigation,
  ChildPlacement,
  LinkTarget,
  NavContextConfig,
  NavContextItem,
  NavContextState,
  NavNode,
  NavNodeKind,
  NavPermissionMode,
  RegionItems,
  RegionVisibility,
} from '@spark-view/spark-data'

export {
  isNavNode,
} from '@spark-view/spark-data'
