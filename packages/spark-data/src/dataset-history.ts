import type { IDataSet, IDataSetMetadata } from './types'

const DEFAULT_HISTORY_NAMESPACE = 'spark:data-history'
const DEFAULT_HISTORY_LIMIT = 20

export interface DataSetHistoryStorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DataSetHistoryScope {
  dataSetName?: string
  pageId?: string
  scopeId?: string
  namespace?: string
}

export interface DataSetHistorySelector {
  entryId?: string
  version?: number
}

export interface DataSetHistoryEntry {
  id: string
  version: number
  timestamp: number
  dataSetName: string
  pageId?: string
  label?: string
  summary?: string
  snapshot: IDataSetMetadata
  sourceData?: Record<string, unknown>
}

export interface DataSetHistoryListOptions extends DataSetHistoryScope {
  adapter?: DataSetHistoryStorageAdapter | null
}

export interface DataSetHistoryCommitOptions extends DataSetHistoryListOptions {
  maxEntries?: number
  label?: string
  summary?: string
  sourceData?: Record<string, unknown>
  version?: number
  timestamp?: number
}

export interface DataSetCommitVersionOptions extends Omit<DataSetHistoryCommitOptions, 'version'> {
  bumpVersion?: boolean
}

interface DataSetHistoryEnvelope {
  entries: DataSetHistoryEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function buildHistoryScope(scope: DataSetHistoryScope): DataSetHistoryScope {
  return {
    ...(scope.dataSetName !== undefined ? { dataSetName: scope.dataSetName } : {}),
    ...(scope.pageId !== undefined ? { pageId: scope.pageId } : {}),
    ...(scope.scopeId !== undefined ? { scopeId: scope.scopeId } : {}),
    ...(scope.namespace !== undefined ? { namespace: scope.namespace } : {}),
  }
}

function resolveAdapter(adapter?: DataSetHistoryStorageAdapter | null): DataSetHistoryStorageAdapter | null {
  return adapter ?? createLocalStorageHistoryAdapter()
}

function normalizeEnvelope(value: unknown): DataSetHistoryEnvelope {
  if (!isRecord(value)) return { entries: [] }
  const rawEntries = value['entries']
  if (!Array.isArray(rawEntries)) return { entries: [] }

  const entries = rawEntries.filter((entry): entry is DataSetHistoryEntry => {
    if (!isRecord(entry)) return false
    return isNonEmptyString(entry['id'])
      && typeof entry['version'] === 'number'
      && typeof entry['timestamp'] === 'number'
      && isNonEmptyString(entry['dataSetName'])
      && isRecord(entry['snapshot'])
  })

  return {
    entries: entries.sort((left, right) => right.timestamp - left.timestamp),
  }
}

function readEnvelope(key: string, adapter: DataSetHistoryStorageAdapter): DataSetHistoryEnvelope {
  const raw = adapter.getItem(key)
  if (!raw) return { entries: [] }
  try {
    return normalizeEnvelope(JSON.parse(raw) as unknown)
  } catch {
    return { entries: [] }
  }
}

function writeEnvelope(key: string, adapter: DataSetHistoryStorageAdapter, envelope: DataSetHistoryEnvelope): void {
  if (envelope.entries.length === 0) {
    adapter.removeItem(key)
    return
  }
  adapter.setItem(key, JSON.stringify(envelope))
}

function toSnapshot(dataSetOrSnapshot: IDataSet | IDataSetMetadata): IDataSetMetadata {
  return 'toData' in dataSetOrSnapshot
    ? cloneJson(dataSetOrSnapshot.toData())
    : cloneJson(dataSetOrSnapshot)
}

function getLatestVersion(entries: DataSetHistoryEntry[]): number {
  let maxVersion = 0
  for (const entry of entries) {
    if (entry.version > maxVersion) {
      maxVersion = entry.version
    }
  }
  return maxVersion
}

export function createLocalStorageHistoryAdapter(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): DataSetHistoryStorageAdapter | null {
  const resolvedStorage = storage
    ?? (typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? globalThis.localStorage
      : undefined)

  if (!resolvedStorage) return null

  return {
    getItem(key: string): string | null {
      return resolvedStorage.getItem(key)
    },
    setItem(key: string, value: string): void {
      resolvedStorage.setItem(key, value)
    },
    removeItem(key: string): void {
      resolvedStorage.removeItem(key)
    },
  }
}

export function resolveDataSetHistoryKey(scope: DataSetHistoryScope): string {
  const identity = scope.scopeId ?? scope.pageId ?? scope.dataSetName
  if (!isNonEmptyString(identity)) {
    throw new Error('DataSet history key requires scopeId, pageId or dataSetName')
  }

  const namespace = isNonEmptyString(scope.namespace)
    ? scope.namespace
    : DEFAULT_HISTORY_NAMESPACE
  return `${namespace}:${identity.trim()}`
}

export function listDataSetHistory(
  scope: DataSetHistoryScope,
  options?: DataSetHistoryListOptions,
): DataSetHistoryEntry[] {
  const adapter = resolveAdapter(options?.adapter)
  if (!adapter) return []

  const key = resolveDataSetHistoryKey(buildHistoryScope({
    ...(scope.dataSetName !== undefined ? { dataSetName: scope.dataSetName } : {}),
    ...(scope.pageId !== undefined ? { pageId: scope.pageId } : {}),
    ...(scope.scopeId !== undefined ? { scopeId: scope.scopeId } : {}),
    ...(options?.namespace !== undefined
      ? { namespace: options.namespace }
      : scope.namespace !== undefined
        ? { namespace: scope.namespace }
        : {}),
  }))
  return readEnvelope(key, adapter).entries
}

export function getDataSetHistoryEntry(
  scope: DataSetHistoryScope,
  selector: DataSetHistorySelector,
  options?: DataSetHistoryListOptions,
): DataSetHistoryEntry | null {
  const entries = listDataSetHistory(scope, options)
  if (isNonEmptyString(selector.entryId)) {
    return entries.find((entry) => entry.id === selector.entryId) ?? null
  }
  if (typeof selector.version === 'number') {
    return entries.find((entry) => entry.version === selector.version) ?? null
  }
  return entries[0] ?? null
}

export function commitDataSetHistory(
  dataSetOrSnapshot: IDataSet | IDataSetMetadata,
  options?: DataSetHistoryCommitOptions,
): DataSetHistoryEntry | null {
  const adapter = resolveAdapter(options?.adapter)
  if (!adapter) return null

  const baseSnapshot = toSnapshot(dataSetOrSnapshot)
  const scope = buildHistoryScope({
    dataSetName: options?.dataSetName ?? baseSnapshot.dataSetName,
    ...(options?.pageId !== undefined
      ? { pageId: options.pageId }
      : baseSnapshot.pageId !== undefined
        ? { pageId: baseSnapshot.pageId }
        : {}),
    ...(options?.scopeId !== undefined ? { scopeId: options.scopeId } : {}),
    ...(options?.namespace !== undefined ? { namespace: options.namespace } : {}),
  })
  const key = resolveDataSetHistoryKey(scope)
  const current = readEnvelope(key, adapter)
  const latestVersion = getLatestVersion(current.entries)
  const resolvedVersion = options?.version ?? Math.max(baseSnapshot.version ?? 0, latestVersion) + 1
  const resolvedTimestamp = options?.timestamp ?? Date.now()
  const snapshot: IDataSetMetadata = {
    ...baseSnapshot,
    version: resolvedVersion,
    ...(scope.pageId !== undefined ? { pageId: scope.pageId } : {}),
  }

  const entry: DataSetHistoryEntry = {
    id: `${resolvedVersion}-${resolvedTimestamp}`,
    version: resolvedVersion,
    timestamp: resolvedTimestamp,
    dataSetName: snapshot.dataSetName,
    ...(scope.pageId !== undefined ? { pageId: scope.pageId } : {}),
    ...(options?.label ? { label: options.label } : {}),
    ...(options?.summary ? { summary: options.summary } : {}),
    snapshot,
    ...(options?.sourceData ? { sourceData: cloneJson(options.sourceData) } : {}),
  }

  const limitedEntries = [entry, ...current.entries]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, options?.maxEntries ?? DEFAULT_HISTORY_LIMIT)

  writeEnvelope(key, adapter, { entries: limitedEntries })
  return entry
}

export function formatPageDataHistoryEntry(
  entry: DataSetHistoryEntry,
  indentation = 2,
): string {
  if (entry.sourceData) {
    return JSON.stringify(entry.sourceData, null, indentation)
  }
  return JSON.stringify({ dataset: entry.snapshot }, null, indentation)
}
