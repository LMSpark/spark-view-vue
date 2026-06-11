import type { AiJsonValue } from '../../json'
import type { ClassModel, ClassModelDocument } from '../class-model'
import type { DtsClassModelSurfaceDocument } from '../class-model/dts-surface-types'
import { jsonSchemaToTypeText } from '../class-model/json-schema-to-type'
import {
  listAttributeReachableKinds,
  projectClassModelForGuide,
} from '../class-model/model-projection'
import {
  renderAttributeTypeText,
  renderMethodSignature,
} from '../class-model/signature-renderer'
import {
  renderAttributeGuide,
  renderMethodGuide,
  renderModelGuide,
} from '../projection'

export type ClassModelKnowledgeQueryInput = Readonly<{
  kind?: string
  keyword?: string
  includeMembers: boolean
}>

export type ClassModelModelGuideInput = Readonly<{
  kind: string
}>

export type ClassModelAttributeGuideInput = Readonly<{
  kind: string
  attributeName: string
}>

export type ClassModelMethodGuideInput = Readonly<{
  kind: string
  methodName: string
}>

export type ClassModelKnowledgeProvider = Readonly<{
  query(input: ClassModelKnowledgeQueryInput): AiJsonValue | Promise<AiJsonValue>
  modelGuide(input: ClassModelModelGuideInput): string | Promise<string>
  attributeGuide(input: ClassModelAttributeGuideInput): string | Promise<string>
  methodGuide(input: ClassModelMethodGuideInput): string | Promise<string>
}>

export type ClassModelKnowledgeServiceOptions = Readonly<{
  document?: ClassModelDocument
  surface?: DtsClassModelSurfaceDocument
  rootClassName?: string
}>

type KnowledgeBackend =
  | Readonly<{ mode: 'document'; document: ClassModelDocument }>
  | Readonly<{ mode: 'surface'; surface: DtsClassModelSurfaceDocument; rootClassName: string }>

export class ClassModelKnowledgeService implements ClassModelKnowledgeProvider {
  private readonly backend: KnowledgeBackend

  public constructor(options: ClassModelKnowledgeServiceOptions) {
    this.backend = resolveBackend(options)
  }

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
                  signature: `${method.name}(${method.paramsTypeText ?? ''})`,
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

  public modelGuide(input: ClassModelModelGuideInput): string {
    if (this.backend.mode === 'surface') {
      return renderSurfaceClassModel(readSurfaceModel(this.backend.surface, input.kind))
    }
    return renderModelGuide({
      document: this.backend.document,
      kind: input.kind,
    }).text
  }

  public attributeGuide(input: ClassModelAttributeGuideInput): string {
    if (this.backend.mode === 'surface') {
      const model = readSurfaceModel(this.backend.surface, input.kind)
      const attribute = model.attributes.find(candidate => candidate.name === input.attributeName)
      if (attribute === undefined) throw new Error(`ClassModel attribute not found: ${input.kind}.${input.attributeName}`)
      return [
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

  public methodGuide(input: ClassModelMethodGuideInput): string {
    if (this.backend.mode === 'surface') {
      const model = readSurfaceModel(this.backend.surface, input.kind)
      const method = model.methods.find(candidate => candidate.name === input.methodName)
      if (method === undefined) throw new Error(`ClassModel method not found: ${input.kind}.${input.methodName}`)
      const chunks = [
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
  for (const attribute of model.attributes) collectTypeRefs(surface, linked, schemaTitle(attribute.schema))
  for (const method of model.methods) {
    collectTypeRefs(surface, linked, method.paramsTypeText)
    collectTypeRefs(surface, linked, method.returnTypeText)
    collectTypeRefs(surface, linked, schemaTitle(method.returnSchema))
  }
  return [...linked]
}

function collectTypeRefs(surface: DtsClassModelSurfaceDocument, linked: Set<string>, text: string | undefined): void {
  if (text === undefined) return
  for (const className of Object.keys(surface.models)) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'u').test(text)) linked.add(className)
  }
}

function schemaTitle(schema: ClassModel['attributes'][number]['schema'] | undefined): string | undefined {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object') return undefined
  return typeof schema.title === 'string' ? schema.title : undefined
}

function renderSurfaceClassModel(model: ClassModel): string {
  const parts = [
    model.jsdoc.trim(),
    `class ${model.className} {`,
    ...model.attributes.map(attribute => indent(`${attribute.writable ? '' : 'readonly '}${attribute.name}: ${jsonSchemaToTypeText(attribute.schema)}`)),
    ...model.methods.map(method => indent(renderSurfaceMethod(method))),
    '}',
  ]
  return parts.filter(part => part.length > 0).join('\n')
}

function renderSurfaceMethod(method: ClassModel['methods'][number]): string {
  const returnText = method.returnTypeText ?? jsonSchemaToTypeText(method.returnSchema)
  return [
    method.jsdoc.trim(),
    `${method.name}(${method.paramsTypeText ?? ''}): ${returnText}`,
  ].filter(part => part.length > 0).join('\n')
}

type ProjectedModel = ReturnType<typeof projectClassModelForGuide>

function modelMatchesKeyword(model: ProjectedModel, keyword: string): boolean {
  const haystacks = [
    model.kind,
    model.className,
    summarizeJsDoc(model.jsdoc),
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
