/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/class-model-knowledge-service
 * 职责：把 ClassModel surface 转成 query、modelGuide、attributeGuide 和 methodGuide 的可读知识结果。
 * 边界：只做知识检索和文本投影，不执行工具、不修改模型实例，也不读取生成文件系统。
 * AI用途：LLM 需要按 kind/action/attribute 获取模型知识时，用本模块理解查询如何收敛到可见上下文。
 */
import type { AiJsonValue } from '../../json'
import type { ClassModel, ClassModelDocument, SourceProvenanceMeta } from '../class-model'
import type { DtsClassModelSurfaceDocument } from '../class-model/dts-surface-types'
import type { DtsTypeMeta } from '../class-model/types'
import { resolveMethodReturnType, visitDtsTypeMeta } from '../class-model/dts-type-meta-ops'
import { jsonSchemaToTypeText } from '../class-model/json-schema-to-type'
import {
  listAttributeReachableKinds,
  projectClassModelForGuide,
} from '../class-model/model-projection'
import {
  renderAttributeTypeText,
  renderMethodSignature,
  renderMethodSignatureFromMeta,
} from '../class-model/signature-renderer'
import {
  renderAttributeGuide,
  renderMethodGuide,
  renderModelGuide,
} from '../projection'

/** Class Model Knowledge Query Input 的输入数据。 */
export type ClassModelKnowledgeQueryInput = Readonly<{
  kind?: string
  keyword?: string
  includeMembers: boolean
}>

/** Class Model Model Guide Input 的输入数据。 */
export type ClassModelModelGuideInput = Readonly<{
  kind: string
}>

/** Class Model Attribute Guide Input 的输入数据。 */
export type ClassModelAttributeGuideInput = Readonly<{
  kind: string
  attributeName: string
}>

/** Class Model Method Guide Input 的输入数据。 */
export type ClassModelMethodGuideInput = Readonly<{
  kind: string
  methodName: string
}>

/** Class Model Knowledge Provider 的语义模型。 */
export type ClassModelKnowledgeProvider = Readonly<{
  query(input: ClassModelKnowledgeQueryInput): AiJsonValue | Promise<AiJsonValue>
  modelGuide(input: ClassModelModelGuideInput): string | Promise<string>
  attributeGuide(input: ClassModelAttributeGuideInput): string | Promise<string>
  methodGuide(input: ClassModelMethodGuideInput): string | Promise<string>
}>

/** Class Model Knowledge Service Options 的调用配置。 */
export type ClassModelKnowledgeServiceOptions = Readonly<{
  document?: ClassModelDocument
  surface?: DtsClassModelSurfaceDocument
  rootClassName?: string
}>

type KnowledgeBackend =
  | Readonly<{ mode: 'document'; document: ClassModelDocument }>
  | Readonly<{ mode: 'surface'; surface: DtsClassModelSurfaceDocument; rootClassName: string }>

/** Class Model Knowledge Service 的语义模型。 */
export class ClassModelKnowledgeService implements ClassModelKnowledgeProvider {
  private readonly backend: KnowledgeBackend

    /** 创建 Class Model Knowledge Service 实例。 */
public constructor(options: ClassModelKnowledgeServiceOptions) {
    this.backend = resolveBackend(options)
  }

    /** 查询参数。 */
public query(input: ClassModelKnowledgeQueryInput): AiJsonValue {
    const keyword = input.keyword?.toLowerCase()
    if (this.backend.mode === 'surface') {
      const { surface, rootClassName } = this.backend
      const models = listReachableSurfaceClassNames(surface, rootClassName)
        .filter(kind => input.kind === undefined || kind === input.kind)
        .map(kind => readSurfaceModel(surface, kind))
        .filter(model => keyword === undefined || modelMatchesKeyword(model, keyword))
        .map(model => ({
          kind: model.kind,
          className: model.className,
          summary: summarizeJsDoc(model.jsdoc),
          ...declarationRelationsProperty(model),
          ...componentProfileProperty(model.provenance),
          ...(input.includeMembers
            ? {
                attributes: model.attributes.map(attribute => ({
                  name: attribute.name,
                  summary: summarizeJsDoc(attribute.jsdoc),
                  typeText: jsonSchemaToTypeText(attribute.schema),
                })),
                methods: model.methods.map(method => ({
                  name: method.name,
                  summary: summarizeJsDoc(method.jsdoc),
                  signature: renderMethodSignatureFromMeta(method),
                })),
              }
            : {}),
        }))
      return {
        rootKind: rootClassName,
        models,
      }
    }

    const document = this.backend.document
    const models = listAttributeReachableKinds(document)
      .filter(kind => input.kind === undefined || kind === input.kind)
      .map(kind => projectClassModelForGuide(document, kind))
      .filter(model => keyword === undefined || modelMatchesKeyword(model, keyword))
      .map(model => ({
        kind: model.kind,
        className: model.className,
        summary: summarizeJsDoc(model.jsdoc),
        ...componentProfileProperty(model.provenance),
        ...(input.includeMembers
          ? {
              attributes: model.attributes.map(attribute => ({
                name: attribute.name,
                summary: summarizeJsDoc(attribute.jsdoc),
                  typeText: renderAttributeTypeText(document, model.kind, attribute),
              })),
              methods: model.methods.map(method => ({
                name: method.name,
                summary: summarizeJsDoc(method.jsdoc),
                  signature: renderMethodSignature(document, model.kind, method),
              })),
            }
          : {}),
      }))

    return {
      rootKind: document.rootKind,
      models,
    }
  }

    /** 执行 model Guide 操作。 */
public modelGuide(input: ClassModelModelGuideInput): string {
    if (this.backend.mode === 'surface') {
      return renderSurfaceClassModel(readSurfaceModel(this.backend.surface, input.kind))
    }
    return renderModelGuide({
      document: this.backend.document,
      kind: input.kind,
    }).text
  }

    /** 执行 attribute Guide 操作。 */
public attributeGuide(input: ClassModelAttributeGuideInput): string {
    if (this.backend.mode === 'surface') {
      const model = readSurfaceModel(this.backend.surface, input.kind)
      const attribute = model.attributes.find(candidate => candidate.name === input.attributeName)
      if (attribute === undefined) throw new Error(`ClassModel attribute not found: ${input.kind}.${input.attributeName}`)
      return [
        renderComponentProfile(model.provenance),
        model.jsdoc.trim(),
        `class ${model.className} {`,
        indent(`${attribute.writable ? '' : 'readonly '}${attribute.name}: ${jsonSchemaToTypeText(attribute.schema)}`),
        '}',
      ].filter(line => line.length > 0).join('\n')
    }
    return renderAttributeGuide({
      document: this.backend.document,
      kind: input.kind,
      attributeName: input.attributeName,
    }).text
  }

    /** 执行 method Guide 操作。 */
public methodGuide(input: ClassModelMethodGuideInput): string {
    if (this.backend.mode === 'surface') {
      const model = readSurfaceModel(this.backend.surface, input.kind)
      const method = model.methods.find(candidate => candidate.name === input.methodName)
      if (method === undefined) throw new Error(`ClassModel method not found: ${input.kind}.${input.methodName}`)
      const chunks = [
        renderComponentProfile(model.provenance),
        model.jsdoc.trim(),
        `class ${model.className} {`,
        indent(renderSurfaceMethod(method)),
        '}',
      ]
      return chunks.filter(line => line.length > 0).join('\n')
    }
    return renderMethodGuide({
      document: this.backend.document,
      kind: input.kind,
      methodName: input.methodName,
    }).text
  }
}

function resolveBackend(options: ClassModelKnowledgeServiceOptions): KnowledgeBackend {
  if (options.surface !== undefined) {
    const rootClassName = options.rootClassName
    if (rootClassName === undefined || rootClassName.length === 0) {
      throw new Error('ClassModelKnowledgeService surface mode requires rootClassName.')
    }
    return { mode: 'surface', surface: options.surface, rootClassName }
  }
  if (options.document !== undefined) return { mode: 'document', document: options.document }
  throw new Error('ClassModelKnowledgeService requires document or surface+rootClassName.')
}

function readSurfaceModel(surface: DtsClassModelSurfaceDocument, className: string): ClassModel {
  const model = surface.models[className]
  if (model === undefined) throw new Error(`ClassModel not found: ${className}`)
  return model
}

function listReachableSurfaceClassNames(
  surface: DtsClassModelSurfaceDocument,
  rootClassName: string,
): readonly string[] {
  const visited = new Set<string>()
  const queue = [rootClassName]
  while (queue.length > 0) {
    const className = queue.shift()
    if (className === undefined || visited.has(className)) continue
    const model = surface.models[className]
    if (model === undefined) continue
    visited.add(className)
    for (const linked of listSurfaceLinkedClassNames(surface, model)) {
      if (!visited.has(linked)) queue.push(linked)
    }
  }
  return [...visited]
}

function listSurfaceLinkedClassNames(surface: DtsClassModelSurfaceDocument, model: ClassModel): readonly string[] {
  const linked = new Set<string>()
  for (const relation of model.declarationRelations ?? []) {
    collectTypeRefs(surface, linked, relation.targetName ?? relation.typeText)
  }
  for (const attribute of model.attributes) collectSchemaTypeRefs(surface, linked, attribute.schema)
  for (const method of model.methods) {
    collectTypeRefs(surface, linked, method.signatureText)
    for (const parameter of method.parameters ?? []) {
      collectDtsTypeRefs(surface, linked, parameter.type)
    }
    collectDtsTypeRefs(surface, linked, resolveMethodReturnType(method))
    collectTypeRefs(surface, linked, method.paramsTypeText)
    collectTypeRefs(surface, linked, method.returnTypeText)
    collectSchemaTypeRefs(surface, linked, method.returnSchema)
    if (method.paramsSchema !== undefined) {
      for (const schema of Object.values(method.paramsSchema.properties ?? {})) {
        collectSchemaTypeRefs(surface, linked, schema)
      }
    }
  }
  return [...linked]
}

function collectDtsTypeRefs(
  surface: DtsClassModelSurfaceDocument,
  linked: Set<string>,
  typeMeta: DtsTypeMeta | undefined,
): void {
  visitDtsTypeMeta(typeMeta, (node) => {
    if (node.type !== 'reference' || node.refersToTypeParameter === true) return
    if (surface.models[node.name] !== undefined) {
      linked.add(node.name)
      return
    }
    collectTypeRefs(surface, linked, node.name)
  })
}

function collectTypeRefs(surface: DtsClassModelSurfaceDocument, linked: Set<string>, text: string | undefined): void {
  if (text === undefined) return
  for (const className of Object.keys(surface.models)) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'u').test(text)) linked.add(className)
  }
}

function collectSchemaTypeRefs(
  surface: DtsClassModelSurfaceDocument,
  linked: Set<string>,
  schema: ClassModel['attributes'][number]['schema'] | undefined,
): void {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object') return
  if (typeof schema.$ref === 'string') collectTypeRefs(surface, linked, schema.$ref)
  if (typeof schema.title === 'string') collectTypeRefs(surface, linked, schema.title)
  if (schema.items !== undefined) collectSchemaTypeRefs(surface, linked, schema.items)
  for (const child of Object.values(schema.properties ?? {})) collectSchemaTypeRefs(surface, linked, child)
  for (const child of schema.anyOf ?? []) collectSchemaTypeRefs(surface, linked, child)
  for (const child of schema.oneOf ?? []) collectSchemaTypeRefs(surface, linked, child)
  for (const child of schema.allOf ?? []) collectSchemaTypeRefs(surface, linked, child)
}

function renderSurfaceClassModel(model: ClassModel): string {
  const parts = [
    renderComponentProfile(model.provenance),
    renderDeclarationRelations(model),
    model.jsdoc.trim(),
    `class ${model.className} {`,
    ...model.attributes.map(attribute => indent(`${attribute.writable ? '' : 'readonly '}${attribute.name}: ${jsonSchemaToTypeText(attribute.schema)}`)),
    ...model.methods.map(method => indent(renderSurfaceMethod(method))),
    '}',
  ]
  return parts.filter(part => part.length > 0).join('\n')
}

function declarationRelationsProperty(
  model: ClassModel,
): { declarationRelations?: DeclarationRelationQueryRecord[] } {
  const relations = model.declarationRelations
  return relations === undefined || relations.length === 0
    ? {}
    : {
        declarationRelations: relations.map(relation => ({
          kind: relation.kind,
          typeText: relation.typeText,
          ...(relation.targetName === undefined ? {} : { targetName: relation.targetName }),
        })),
      }
}

type DeclarationRelationQueryRecord = Readonly<{
  kind: string
  typeText: string
  targetName?: string
}>

function renderDeclarationRelations(model: ClassModel): string {
  const lines: string[] = []
  if (model.declarationTypeText !== undefined) {
    lines.push(`DTS declaration: ${model.className} = ${model.declarationTypeText}`)
  }
  for (const relation of model.declarationRelations ?? []) {
    lines.push(`DTS relation: ${relation.kind} ${relation.typeText}`)
  }
  if (lines.length === 0) return ''
  return [
    '/**',
    ...lines.map(line => ` * ${line}`),
    ' */',
  ].join('\n')
}

type ComponentProfile = Readonly<{
  name?: string
  type?: string
  level?: string
  layer?: string
  directory?: string
}>

function componentProfileProperty(
  provenance: SourceProvenanceMeta | undefined,
): { component?: ComponentProfile } {
  const component = componentProfile(provenance)
  return component === undefined ? {} : { component }
}

function componentProfile(provenance: SourceProvenanceMeta | undefined): ComponentProfile | undefined {
  if (provenance === undefined) return undefined
  const component: ComponentProfile = {
    ...(provenance.componentName === undefined ? {} : { name: provenance.componentName }),
    ...(provenance.componentType === undefined ? {} : { type: provenance.componentType }),
    ...(provenance.componentLevel === undefined ? {} : { level: provenance.componentLevel }),
    ...(provenance.componentLayer === undefined ? {} : { layer: provenance.componentLayer }),
    ...(provenance.componentDirectory === undefined ? {} : { directory: provenance.componentDirectory }),
  }
  return Object.keys(component).length === 0 ? undefined : component
}

function renderComponentProfile(provenance: SourceProvenanceMeta | undefined): string {
  const component = componentProfile(provenance)
  if (component === undefined) return ''
  const parts = [
    component.type === undefined ? undefined : `type=${component.type}`,
    component.name === undefined ? undefined : `name=${component.name}`,
    component.level === undefined ? undefined : `level=${component.level}`,
    component.layer === undefined ? undefined : `layer=${component.layer}`,
    component.directory === undefined ? undefined : `directory=${component.directory}`,
  ].filter(part => part !== undefined)
  return `/** SPARK component ${parts.join('; ')} */`
}

function renderSurfaceMethod(method: ClassModel['methods'][number]): string {
  return [
    method.jsdoc.trim(),
    renderMethodSignatureFromMeta(method),
  ].filter(part => part.length > 0).join('\n')
}

type ProjectedModel = ReturnType<typeof projectClassModelForGuide>

function modelMatchesKeyword(model: ProjectedModel, keyword: string): boolean {
  const haystacks = [
    model.kind,
    model.className,
    summarizeJsDoc(model.jsdoc),
    model.provenance?.componentName ?? '',
    model.provenance?.componentType ?? '',
    model.provenance?.componentLevel ?? '',
    model.provenance?.componentLayer ?? '',
    model.provenance?.componentDirectory ?? '',
    ...model.attributes.flatMap(attribute => [attribute.name, summarizeJsDoc(attribute.jsdoc)]),
    ...model.methods.flatMap(method => [method.name, summarizeJsDoc(method.jsdoc)]),
  ]
  return haystacks.some(value => value.toLowerCase().includes(keyword))
}

function summarizeJsDoc(jsdoc: string): string {
  const lines = jsdoc
    .replace(/^\/\*\*/u, '')
    .replace(/\*\/$/u, '')
    .split(/\r?\n/u)
    .map(line => line.replace(/^\s*\*\s?/u, '').trim())
    .filter(line => line.length > 0 && !line.startsWith('@'))
  return lines[0] ?? ''
}

function indent(text: string): string {
  return text
    .split(/\r?\n/u)
    .map(line => (line.length === 0 ? line : `  ${line}`))
    .join('\n')
}
