/**
 * @module @spark-appworks/spark-ai:class-model/class-model/from-runtime-metadata
 * @spark-appworks/spark-ai 的 class-model/class-model/from-runtime-metadata 模块。
 * 导出 ClassModel symbol: RuntimeDocumentInput（共 1 个 symbol）。
 */
import type { AiJsonSchemaObject } from '../../json'
import type { AiModuleMetadataJson } from '../metadata'
import type { ClassModelDocument } from './types'
import { CLASS_MODEL_DOCUMENT_VERSION } from './types'

/** Runtime Document Input 的输入数据。 */
type RuntimeDocumentInput = Readonly<{
  $defs?: Readonly<Record<string, AiJsonSchemaObject>>
  modules: readonly AiModuleMetadataJson[]
}>

/** 输入适配：runtime metadata → ClassModelDocument（只存 module，不物化 models）。 */
export function createClassModelDocumentFromRuntimeDocument(
  document: RuntimeDocumentInput,
): ClassModelDocument {
  const module = document.modules[0]
  if (module === undefined) {
    throw new Error('ClassModel runtime document requires at least one module metadata entry.')
  }
  return createClassModelDocumentFromModuleMetadata({
    module,
    ...(document.$defs === undefined ? {} : { schemaDefs: document.$defs }),
  })
}

export function createClassModelDocumentFromModuleMetadata(command: Readonly<{
  module: AiModuleMetadataJson
  schemaDefs?: Readonly<Record<string, AiJsonSchemaObject>>
}>): ClassModelDocument {
  return {
    schemaVersion: CLASS_MODEL_DOCUMENT_VERSION,
    rootKind: command.module.rootApi.kind,
    module: command.module,
    ...(command.schemaDefs === undefined ? {} : { $defs: command.schemaDefs }),
  }
}
