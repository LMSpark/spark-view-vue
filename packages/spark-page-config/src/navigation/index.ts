export type {
  AppModuleBase,
  AppNavRoot,
  AppNavigation,
  NavContextConfig,
  NavContextItem,
  NavContextState,
  NavNode,
  NavNodeKind,
} from './nav-model'

export type {
  ChildPlacement,
  LinkTarget,
  NavPermissionMode,
  RegionItems,
  RegionVisibility,
} from './nav-model'

export {
  buildNavRoot,
  createChildPageNode,
  createNavigationNodeDraft,
  createNavigationNodePatch,
  createReservedRootGroup,
  createRootModuleNode,
  normalizeNavNode,
  normalizeNavRoot,
} from './nav-editing'

export {
  DEFAULT_NAV_ICON_BY_KIND,
  applyNavigationNodeDraftToNode,
  applyNodeKindPresetToDraft,
  canUseModuleNodeKind,
  defaultNavIconByKind,
  inferNavNodeKind,
  isConfigNodeKind,
  isPageLikeKind,
} from './nav-editing'

export {
  findConfigNodeByPageId,
  findNodeById,
  findNodeLocation,
  findParentNodeById,
  isSystemRootDirectory,
  normalizePageIdFromPath,
  normalizeRootChildPlacement,
} from './nav-editing'

export {
  NavigationEditSession,
} from './nav-editing'

export type {
  NavNodeLocation,
  NavigationContextDraft,
  NavigationContextDraftConfig,
  NavigationNodeDraft,
  NavigationNodeDraftApplyResult,
  NavigationNodeDraftInput,
} from './nav-editing'

export {
  NavigationConfigClient,
} from './nav-client'

export type {
  LinkProbeResult,
  NavigationConfigClientOptions,
} from './nav-client'
