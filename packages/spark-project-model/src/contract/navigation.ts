export type { AppNavRoot, ChildPlacement, LinkTarget, NavNode, NavNodeKind, NavPermissionMode } from "@spark-view/spark-data"
export { isNavNode } from "@spark-view/spark-data"
import type { NavNode, NavNodeKind, LinkTarget, NavPermissionMode } from "@spark-view/spark-data"
export type NavDraft = { id: string; title: string; icon: string; nodeKind: NavNodeKind; dividerAfter: boolean; description: string; path: string; redirect: string; linkTarget: LinkTarget; parentPageId: string; childPlacement: string; order: number; hidden: boolean; disabled: boolean; refId: string; permissionMode: NavPermissionMode }
export type NavContextDraft = { hasContext: boolean; items: Array<{ id: string; title: string }>; config: { placeholder: string; defaultValue: string; paramName: string } }
export type NavDraftApplyResult = { patch: Partial<NavNode> & Pick<NavNode, "id" | "title" | "nodeKind">; warnings: string[] }
export type NavNodeLocation = { node: NavNode; parent: NavNode | null; parentId: string | null; index: number }
