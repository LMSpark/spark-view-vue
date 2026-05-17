import type { NavNode } from '../navigation/nav-model'

function normalizePath(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withLeadingSlash.length === 1) return withLeadingSlash
  return withLeadingSlash.replace(/\/+$/, '')
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function resolveCrossProjectRefPageId(refPath: string | undefined): string | null {
  const normalizedRefPath = typeof refPath === 'string' ? refPath.trim() : ''
  if (normalizedRefPath === '') return null

  const match = /^@app:[^/]+(\/.*)?$/.exec(normalizedRefPath)
  const targetPath = (match?.[1] ?? normalizedRefPath).split('#', 1)[0]?.split('?', 1)[0] ?? ''
  const pageId = targetPath.replace(/^\/+/, '').replace(/\/+$/, '')
  return pageId === '' ? null : pageId
}

export function resolveNavRoutePageId(node: NavNode, rawNodePath: string): string {
  if (node.nodeKind === 'ref') {
    return resolveCrossProjectRefPageId(node.refPath) ?? node.refId ?? node.id
  }

  const normalizedPath = normalizePath(rawNodePath)
  const slug = normalizedPath.replace(/^\/+/, '').replace(/\/+$/, '')
  const slugSegments = slug.split('/').filter(Boolean)
  const isConfigLikeNode =
    node.nodeKind !== 'system-page' &&
    node.nodeKind !== 'system-action' &&
    node.nodeKind !== 'link'

  if (isConfigLikeNode && slugSegments.length === 1) {
    return slugSegments[0] as string
  }

  if (isConfigLikeNode && slugSegments.length > 1 && isUuidLike(node.id)) {
    return slugSegments[slugSegments.length - 1] as string
  }

  return node.id
}
