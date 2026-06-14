/**
 * @module @spark-appworks/spark-ai:class-model/class-model/class-model-to-json-schema
 * 职责：DtsTypeDeclarationModel / DtsFileProjectionDocument / .d.ts 根文件 → 标准 Draft 2020-12 JSON Schema。
 * 边界：只做结构映射与 emit，不修改 DtsTypeDeclarationModel，也不耦合 bundle 写盘或运行时加载。
 * AI用途：LLM 工具参数、表单生成、文档校验的统一 JSON Schema 入口。
 */
import { resolve } from 'node:path'

import ts from 'typescript'

import type { AttributeMeta, DtsTypeDeclarationModel, ConstructorMeta, MethodMeta } from './types'
import type { DtsFileProjectionDocument } from './dts-bundle-types'
import {
  assertDraft2020Schema,
  attachJsonSchemaDefs,
  standardizeJsonSchema,
  type StandardJsonSchema,
  type StandardJsonSchemaObject,
} from '@spark-appworks/spark-json-document'
import { projectDtsSourceFileProjection } from './project-from-declarations'
import {
  buildEnumJsonSchema,
  buildObjectJsonSchema,
  extractConstOrSingleEnumValue,
  finalizeDraft2020SchemaDocument,
  isWritableRequiredAttribute,
  modelDescription,
} from './json-schema-emit'
import {
  CLASS_MODEL_CONSTRUCTOR_PARAMS_DEF_KEY,
  classModelMethodParamsDefKey,
  classModelMethodReturnDefKey,
} from './class-model-json-schema-def-keys'

function schemaTitleMeta(model: DtsTypeDeclarationModel): Readonly<{ title: string; description?: string }> {
  const description = modelDescription(model.jsdoc)
  return description === undefined
    ? { title: model.name }
    : { title: model.name, description }
}

function buildClassModelDraft(model: DtsTypeDeclarationModel): StandardJsonSchemaObject {
  if (model.declarationKind === 'enum') {
    const enumValues = jsonSchemaAttributes(model)
      .map(attribute => extractConstOrSingleEnumValue(standardizeJsonSchema(attribute.schema ?? true)))
      .filter((value): value is string | number | boolean | null => value !== undefined)

    return buildEnumJsonSchema({
      ...schemaTitleMeta(model),
      values: enumValues,
    })
  }

  const properties: Record<string, StandardJsonSchema> = {}
  const required: string[] = []

  for (const attribute of jsonSchemaAttributes(model)) {
    if (!attribute.readable) continue
    properties[attribute.name] = standardizeJsonSchema(attribute.schema ?? true)
    if (isWritableRequiredAttribute(attribute.readable, attribute.writable)) {
      required.push(attribute.name)
    }
  }

  return buildObjectJsonSchema({
    ...schemaTitleMeta(model),
    properties,
    required,
  })
}

/** DtsTypeDeclarationModel → 标准 Draft 2020-12 JSON Schema。 */
export function classModelToJsonSchema(
  model: DtsTypeDeclarationModel,
): StandardJsonSchemaObject {
  if (model.jsonSchema !== undefined) {
    const standardized = standardizeJsonSchema(model.jsonSchema)
    if (typeof standardized !== 'boolean') return attachExecutableSchemaDefs(standardized, model)
  }
  return attachExecutableSchemaDefs(finalizeDraft2020SchemaDocument(
    buildClassModelDraft(model),
    model.name,
  ), model)
}

function attachExecutableSchemaDefs(
  schema: StandardJsonSchemaObject,
  model: DtsTypeDeclarationModel,
): StandardJsonSchemaObject {
  const defs = executableSchemaDefsForModel(model)
  if (Object.keys(defs).length === 0) {
    assertDraft2020Schema(schema)
    return schema
  }
  const attached = standardizeJsonSchema(attachJsonSchemaDefs(schema, defs))
  if (typeof attached === 'boolean') {
    throw new Error(`jsonSchema("${model.name}") produced boolean schema after executable $defs attach`)
  }
  assertDraft2020Schema(attached)
  return attached
}

function executableSchemaDefsForModel(model: DtsTypeDeclarationModel): Record<string, StandardJsonSchema> {
  const defs: Record<string, StandardJsonSchema> = {}
  const constructorParamsSchema = jsonSchemaConstructor(model)?.paramsSchema
  if (constructorParamsSchema !== undefined) {
    defs[CLASS_MODEL_CONSTRUCTOR_PARAMS_DEF_KEY] = standardizeJsonSchema(constructorParamsSchema)
  }

  for (const method of jsonSchemaMethods(model)) {
    if (method.paramsSchema !== undefined) {
      defs[classModelMethodParamsDefKey(method.name)] = standardizeJsonSchema(method.paramsSchema)
    }
    if (method.returnSchema !== undefined) {
      defs[classModelMethodReturnDefKey(method.name)] = standardizeJsonSchema(method.returnSchema)
    }
  }
  return defs
}

/** 为 bundle 写盘填充每个 model 的 jsonSchema 字段。 */
export function attachModelJsonSchemas(
  models: Readonly<Record<string, DtsTypeDeclarationModel>>,
): Record<string, DtsTypeDeclarationModel> {
  const result: Record<string, DtsTypeDeclarationModel> = {}
  for (const [className, model] of Object.entries(models)) {
    result[className] = shouldAttachModelJsonSchema(model)
      ? {
          ...model,
          jsonSchema: classModelToJsonSchema(model),
        }
      : model
  }
  return result
}

function shouldAttachModelJsonSchema(model: DtsTypeDeclarationModel): boolean {
  if (model.jsonSchema !== undefined) return true
  return !(model.declarationKind === 'typeAlias'
    && model.typeAlias.members.attributes.length === 0
    && model.typeAlias.members.methods.length === 0)
}

function jsonSchemaAttributes(model: DtsTypeDeclarationModel): readonly AttributeMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.attributes
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.attributes
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.attributes
  return model.enumDecl.members
}

function jsonSchemaMethods(model: DtsTypeDeclarationModel): readonly MethodMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.methods
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.methods
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.methods
  return []
}

function jsonSchemaConstructor(model: DtsTypeDeclarationModel): ConstructorMeta | undefined {
  return model.declarationKind === 'class' ? model.classDecl.constructorMeta : undefined
}

/** Shard 级映射：优先读 model.jsonSchema，否则现场计算。 */
export function shardToJsonSchemas(
  shard: DtsFileProjectionDocument,
): Readonly<Record<string, StandardJsonSchemaObject>> {
  const result: Record<string, StandardJsonSchemaObject> = {}
  for (const [className, model] of Object.entries(shard.models)) {
    result[className] = classModelToJsonSchema(model)
  }
  return result
}

/** Project Dts Root Files To Json Schemas Options 的调用配置。 */
export type ProjectDtsRootFilesToJsonSchemasOptions = Readonly<{
  /** 仓库根目录绝对路径，用于将 rootFiles 相对路径解析为绝对路径 */
  repoRoot: string
  /** 入口 .d.ts 文件路径列表（相对或绝对），TypeScript 编译器以此创建 Program */
  rootFiles: readonly string[]
  /** 是否只导出带 export 修饰的声明；默认 true，忽略未导出的内部类型 */
  exportedOnly?: boolean
  /** 自定义 TypeScript CompilerHost；未提供时使用默认文件系统 Host */
  compilerHost?: ts.CompilerHost
}>

/** 单个 .d.ts 文件的 JSON Schema 映射结果。 */
export type DtsFileJsonSchemasResult = Readonly<{
  /** 源 .d.ts 文件的绝对路径，与 rootFiles 中的对应项一致 */
  sourcePath: string
  /** className → 标准 Draft 2020-12 JSON Schema 的映射，key 为模型类名 */
  schemas: Readonly<Record<string, StandardJsonSchemaObject>>
}>

/** 将 .d.ts 根文件批量映射为标准 Draft 2020-12 JSON Schema。 */
export function projectDtsRootFilesToJsonSchemas(
  options: ProjectDtsRootFilesToJsonSchemasOptions,
): readonly DtsFileJsonSchemasResult[] {
  const repoRoot = resolve(options.repoRoot)
  const rootFiles = options.rootFiles.map(file => resolve(file))
  const program = ts.createProgram({
    rootNames: rootFiles,
    options: {
      allowJs: false,
      declaration: true,
      emitDeclarationOnly: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    ...(options.compilerHost === undefined ? {} : { host: options.compilerHost }),
  })
  const exportedOnly = options.exportedOnly ?? true

  const results: DtsFileJsonSchemasResult[] = []

  for (const rootFile of rootFiles) {
    const sourceFile = program.getSourceFile(rootFile)
    if (sourceFile === undefined) continue

    const shard = projectDtsSourceFileProjection({
      repoRoot,
      absolutePath: rootFile,
      sourceFile,
      exportedOnly,
    })

    results.push({
      sourcePath: rootFile,
      schemas: shardToJsonSchemas(shard),
    })
  }

  return results
}
