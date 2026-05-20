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

export type NavContextItem = {
  id: string | number
  title: string
}

export type NavContextConfig = {
  source: string | NavContextItem[]
  placeholder?: string
  defaultValue?: string | number
  paramName?: string
}

export type NavContextInput = string | NavContextItem[] | NavContextConfig

export type AppModuleBase<TChild = unknown> = {
  id?: string
  title: string
  description?: string
  version?: string
  children?: TChild[]
}

export type NavPermissionMode = 'none' | 'masked' | 'invisible'

export type AppNavigation = {
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

export type NavNode = AppModuleBase<NavNode> & AppNavigation & {
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

export type AppNavRoot = AppModuleBase<NavNode> & {
  childPlacement: 'header' | 'sidebar'
  children: NavNode[]
  homePath?: string
}

export type RegionItems = {
  header: NavNode[]
  sidebar: NavNode[]
  toolbar: NavNode[]
  userMenu: NavNode[]
}

export type RegionVisibility = {
  header: boolean
  sidebar: boolean
  toolbar: boolean
  userMenu: boolean
}

export type NavContextState = {
  config: NavContextConfig
  nodeId: string
  selected: string | number | null
  items: NavContextItem[]
  loading: boolean
  error: string | null
}
