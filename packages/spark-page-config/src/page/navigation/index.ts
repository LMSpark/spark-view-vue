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
} from './nav-model'

export {
  DEFAULT_NAV_ICON_BY_KIND,
  NavigationEditSession,
  applyNavigationNodeDraftToNode,
  applyNodeKindPresetToDraft,
  buildNavRoot,
  canUseModuleNodeKind,
  createChildPageNode,
  createNavigationNodeDraft,
  createNavigationNodePatch,
  createReservedRootGroup,
  createRootModuleNode,
  defaultNavIconByKind,
  findConfigNodeByPageId,
  findNodeById,
  findNodeLocation,
  findParentNodeById,
  inferNavNodeKind,
  isConfigNodeKind,
  isPageLikeKind,
  isSystemRootDirectory,
  normalizeNavNode,
  normalizeNavRoot,
  normalizePageIdFromPath,
  normalizeRootChildPlacement,
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
} from './client'

export type {
  LinkProbeResult,
  NavigationConfigClientOptions,
} from './client'
