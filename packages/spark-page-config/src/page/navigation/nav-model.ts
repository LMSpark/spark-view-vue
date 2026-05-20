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

// 这里不再为 JS 基础类型保留导出别名，导航上下文输入直接内联为原生联合类型。

export interface AppModuleBase {
  id?: string
  title: string
  description?: string
  version?: string
}

export type NavPermissionMode = 'none' | 'masked' | 'invisible'

export interface AppNavigation {
  icon?: string
  nodeKind?: NavNodeKind
  childPlacement?: ChildPlacement
  context?: string | NavContextItem[] | NavContextConfig
  order?: number
  hidden?: boolean
  disabled?: boolean
  dividerAfter?: boolean
  permissionMode?: NavPermissionMode
}

export interface NavNode extends AppModuleBase, AppNavigation {
  id: string
    children?: NavNode[]
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

export interface AppNavRoot extends AppModuleBase {
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
