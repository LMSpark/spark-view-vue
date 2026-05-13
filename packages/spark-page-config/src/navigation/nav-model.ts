/** Navigation model types shared by page-config and spark-app. */

export type ChildPlacement = 'header' | 'sidebar' | 'toolbar' | 'user-menu' | 'parent' | 'flat'

export type NavNodeKind =
  | 'system-directory'
  | 'module'
  | 'system-page'
  | 'system-action'
  | 'page'
  | 'link'
  | 'sub-page'
  | 'ref'

export type LinkTarget = 'iframe' | 'new-tab' | 'self'

export interface NavContextItem {
  id: string | number
  title: string
}

export interface NavContextConfig {
  source: string | NavContextItem[]
  placeholder?: string
  defaultValue?: string | number
  paramName?: string
}

export type NavContextInput = string | NavContextItem[] | NavContextConfig

export interface AppModuleBase<TChild = unknown> {
  id?: string
  title: string
  description?: string
  version?: string
  children?: TChild[]
}

export type NavPermissionMode = 'none' | 'masked' | 'invisible'

export interface AppNavigation {
  icon?: string
  nodeKind?: NavNodeKind
  childPlacement?: ChildPlacement
  context?: NavContextInput
  order?: number
  hidden?: boolean
  disabled?: boolean
  dividerAfter?: boolean
  permissionMode?: NavPermissionMode
}

export interface NavNode extends AppModuleBase<NavNode>, AppNavigation {
  id: string
  path?: string
  linkTarget?: LinkTarget
  redirect?: string
  parentPageId?: string
  refId?: string
  refPath?: string
  refProjectId?: string
  refNodeKind?: NavNodeKind
  refBroken?: boolean
}

export interface AppNavRoot extends AppModuleBase<NavNode> {
  childPlacement: 'header' | 'sidebar'
  children: NavNode[]
  homePath?: string
}

export interface RegionItems {
  header: NavNode[]
  sidebar: NavNode[]
  toolbar: NavNode[]
  userMenu: NavNode[]
}

export interface RegionVisibility {
  header: boolean
  sidebar: boolean
  toolbar: boolean
  userMenu: boolean
}

export interface NavContextState {
  config: NavContextConfig
  nodeId: string
  selected: string | number | null
  items: NavContextItem[]
  loading: boolean
  error: string | null
}
