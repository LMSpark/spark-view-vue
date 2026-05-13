import type { PageDesignEditHost } from '@spark-view/spark-page-config'

export interface PageDesignEditHostSnapshot {
  readonly pageId: string
  readonly host: PageDesignEditHost
}

type PageDesignEditHostResolver = () => PageDesignEditHostSnapshot | null

const resolvers = new Set<PageDesignEditHostResolver>()

function normalizePageId(pageId: string | null | undefined): string {
  return typeof pageId === 'string' ? pageId.trim() : ''
}

function readSnapshots(): PageDesignEditHostSnapshot[] {
  const snapshots: PageDesignEditHostSnapshot[] = []
  for (const resolver of resolvers) {
    const snapshot = resolver()
    const pageId = normalizePageId(snapshot?.pageId)
    if (snapshot === null || pageId === '') continue
    snapshots.push({ pageId, host: snapshot.host })
  }
  return snapshots
}

export function registerPageDesignEditHost(resolver: PageDesignEditHostResolver): () => void {
  resolvers.add(resolver)
  return () => {
    resolvers.delete(resolver)
  }
}

export function resolvePageDesignEditHost(pageId?: string | null): PageDesignEditHost | null {
  const requestedPageId = normalizePageId(pageId)
  const snapshots = readSnapshots().reverse()
  if (requestedPageId !== '') {
    const exact = snapshots.find((snapshot) => snapshot.pageId === requestedPageId)
    if (exact !== undefined) return exact.host
  }
  return snapshots[0]?.host ?? null
}

export function resolvePageDesignEditPageId(pageId?: string | null): string | null {
  const requestedPageId = normalizePageId(pageId)
  const snapshots = readSnapshots().reverse()
  if (requestedPageId !== '') {
    const exact = snapshots.find((snapshot) => snapshot.pageId === requestedPageId)
    if (exact !== undefined) return exact.pageId
  }
  return snapshots[0]?.pageId ?? null
}
