import type { ClassModel } from './types'

export const DTS_FILE_PROJECTION_VERSION = 1 as const
export const DTS_CLASS_MODEL_BUNDLE_PROTOCOL = 'spark-appworks.dts-class-model.bundle' as const
export const DTS_CLASS_MODEL_BUNDLE_VERSION = 1 as const

export type DtsFileProjectionDocument = Readonly<{
  schemaVersion: typeof DTS_FILE_PROJECTION_VERSION
  sourcePath: string
  symbols: readonly string[]
  models: Readonly<Record<string, ClassModel>>
  generatedAt?: string
}>

export type DtsClassModelBundleFileEntry = Readonly<{
  file: string
}>

export type DtsClassModelBundleClassEntry = Readonly<{
  sourcePath: string
  file: string
}>

export type DtsClassModelBundleManifest = Readonly<{
  schemaVersion: typeof DTS_CLASS_MODEL_BUNDLE_VERSION
  protocol: typeof DTS_CLASS_MODEL_BUNDLE_PROTOCOL
  generatedAt: string
  scannedFileCount: number
  files: Readonly<Record<string, DtsClassModelBundleFileEntry>>
  classIndex: Readonly<Record<string, DtsClassModelBundleClassEntry>>
  duplicates?: readonly DtsClassModelDuplicateRecord[]
}>

export type DtsClassModelDuplicateRecord = Readonly<{
  className: string
  keptFile: string
  skippedFile: string
}>

export type ProjectDtsFileProjectionOptions = Readonly<{
  repoRoot: string
  absolutePath: string
  exportedOnly?: boolean
}>
