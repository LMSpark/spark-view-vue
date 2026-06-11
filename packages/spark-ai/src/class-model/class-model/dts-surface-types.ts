import type { ClassModel } from './types'

export const DTS_CLASS_MODEL_SURFACE_VERSION = 1 as const

export type DtsClassModelSurfaceDocument = Readonly<{
  schemaVersion: typeof DTS_CLASS_MODEL_SURFACE_VERSION
  source: 'declarations'
  configPath: string
  models: Readonly<Record<string, ClassModel>>
  fileIndex: Readonly<Record<string, readonly string[]>>
  generatedAt?: string
}>

export type ProjectDtsClassModelSurfaceOptions = Readonly<{
  configPath: string
  skipVueComponentDts?: boolean
  exportedOnly?: boolean
  failOnDuplicate?: boolean
}>
