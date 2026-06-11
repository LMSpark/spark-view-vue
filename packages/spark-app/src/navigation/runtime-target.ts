/**
 * @module @spark-appworks/spark-app:navigation/runtime-target
 * @spark-appworks/spark-app 的 navigation/runtime-target 模块。
 * 导出 ClassModel symbol: NavNodeRouteTargetKind, NavNodeRouteTarget, NavNodeExternalTarget, NavNodeActionTarget, NavNodeContainerTarget, NavNodeHiddenTarget, NavNodeRuntimeTarget（共 7 个 symbol）。
 */
import type { ProjectNodeData } from '@spark-appworks/spark-project-model'

/** Nav Node Route Target Kind 的语义模型。 */
export type NavNodeRouteTargetKind = 'page' | 'external-link' | 'cross-project-ref'

/** Nav Node Route Target 的语义模型。 */
export type NavNodeRouteTarget = {
    /** 类型判别字段。 */
kind: 'route'
    /** route Kind 字段。 */
routeKind: NavNodeRouteTargetKind
    /** 资源路径。 */
path: string}

/** Nav Node External Target 的语义模型。 */
export type NavNodeExternalTarget = {
    /** 类型判别字段。 */
kind: 'external'
    /** mode 字段。 */
mode: 'new-tab' | 'self'
    /** href 字段。 */
href: string}

/** Nav Node Action Target 的语义模型。 */
export type NavNodeActionTarget = {
    /** 类型判别字段。 */
kind: 'action'
    /** command 字段。 */
command: string}

/** Nav Node Container Target 的语义模型。 */
export type NavNodeContainerTarget = {
    /** 类型判别字段。 */
kind: 'container'
    /** redirect 字段。 */
redirect?: string}

/** Nav Node Hidden Target 的语义模型。 */
export type NavNodeHiddenTarget = {
    /** 类型判别字段。 */
kind: 'hidden'
    /** reason 字段。 */
reason: 'sub-page'}

/** Nav Node Runtime Target 的语义模型。 */
export type NavNodeRuntimeTarget =
  | NavNodeRouteTarget
  | NavNodeExternalTarget
  | NavNodeActionTarget
  | NavNodeContainerTarget
  | NavNodeHiddenTarget

export function normalizeNavRuntimePath(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withLeadingSlash.length === 1) return withLeadingSlash
  return withLeadingSlash.replace(/\/+$/, '')
}

function normalizeActionCommand(value: string): string {
  return value.trim().replace(/^\/+/, '')
}

function resolveRefHostPath(node: ProjectNodeData): string {
  const explicitPath = typeof node.path === 'string' ? normalizeNavRuntimePath(node.path) : ''
  if (explicitPath.includes('/__ref/')) return explicitPath
  return normalizeNavRuntimePath(`/__ref/${encodeURIComponent(node.id)}`)
}

export function resolveNavNodeRuntimeTarget(node: ProjectNodeData): NavNodeRuntimeTarget {
  const nodeKind = node.nodeKind ?? 'page'

  if (nodeKind === 'sub-page') {
    return { kind: 'hidden', reason: 'sub-page' }
  }

  if (nodeKind === 'system-action') {
    const command = typeof node.path === 'string' && node.path.trim() !== ''
      ? normalizeActionCommand(node.path)
      : node.id
    return { kind: 'action', command }
  }

  const redirect = typeof node.redirect === 'string' && node.redirect.trim() !== ''
    ? normalizeNavRuntimePath(node.redirect)
    : undefined

  if (nodeKind === 'module' || nodeKind === 'system-directory') {
    return redirect === undefined ? { kind: 'container' } : { kind: 'container', redirect }
  }

  if (nodeKind === 'ref') {
    return {
      kind: 'route',
      routeKind: 'cross-project-ref',
      path: resolveRefHostPath(node),
    }
  }

  if (nodeKind === 'link') {
    const href = typeof node.path === 'string' ? node.path.trim() : ''
    if (node.linkTarget === 'new-tab') {
      return { kind: 'external', mode: 'new-tab', href }
    }
    if (node.linkTarget === 'self') {
      return { kind: 'external', mode: 'self', href }
    }
    if (href === '') {
      return redirect === undefined ? { kind: 'container' } : { kind: 'container', redirect }
    }
    return {
      kind: 'route',
      routeKind: 'external-link',
      path: normalizeNavRuntimePath(`/__link/${encodeURIComponent(node.id)}`),
    }
  }

  const path = typeof node.path === 'string' && node.path.trim() !== ''
    ? normalizeNavRuntimePath(node.path)
    : ''
  if (path !== '') {
    return { kind: 'route', routeKind: 'page', path }
  }

  return redirect === undefined ? { kind: 'container' } : { kind: 'container', redirect }
}
