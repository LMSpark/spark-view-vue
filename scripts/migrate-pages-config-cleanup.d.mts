export type DeletedPageEntry = Readonly<{
  tenantId: string
  projectId: string
  pageId: string
}>

export function buildCleanupScopeSubquery(entries: readonly DeletedPageEntry[]): string

export function buildApplyStatements(entries?: readonly DeletedPageEntry[]): string[]
