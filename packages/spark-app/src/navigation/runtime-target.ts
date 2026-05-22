import type { NavNode } from './nav-model'

export type NavNodeRouteTargetKind = 'page' | 'external-link' | 'cross-project-ref'

export type NavNodeRouteTarget = {
  kind: 'route'
  routeKind: NavNodeRouteTargetKind
  path: string}

export type NavNodeExternalTarget = {
  kind: 'external'
  mode: 'new-tab' | 'self'
  href: string}

export type NavNodeActionTarget = {
  kind: 'action'
  command: string}

export type NavNodeContainerTarget = {
  kind: 'container'
  redirect?: string}

export type NavNodeHiddenTarget = {
  kind: 'hidden'
  reason: 'sub-page'}

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

function resolveRefHostPath(node: NavNode): string {
  const explicitPath = typeof node.path === 'string' ? normalizeNavRuntimePath(node.path) : ''
  if (explicitPath.includes('/__ref/')) return explicitPath
  return normalizeNavRuntimePath(`/__ref/${encodeURIComponent(node.id)}`)
}

export function resolveNavNodeRuntimeTarget(node: NavNode): NavNodeRuntimeTarget {
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
