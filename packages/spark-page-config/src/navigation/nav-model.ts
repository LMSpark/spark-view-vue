/**
 * 导航模型类型 — 从 spark-data 委托 re-export。
 *
 * 纯数据模型类型的 SSOT 在 @spark-view/spark-data。
 * 本文件保留 re-export 以维持 spark-page-config 内部兼容，
 * nav-editing / nav-client 仍从此文件导入类型。
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
