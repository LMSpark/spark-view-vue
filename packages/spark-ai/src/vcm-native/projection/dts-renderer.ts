import type { AttributeMeta, ClassModel, ClassModelDocument, JsDocMeta, MethodMeta } from '../class-model'

export type ModelGuideRenderInput = Readonly<{
  document: ClassModelDocument
  kind: string
}>

export type ModelGuide = Readonly<{
  kind: string
  declaration: string
  text: string
}>

export type AttributeGuideRenderInput = Readonly<{
  document: ClassModelDocument
  kind: string
  attributeName: string
}>

export type AttributeGuide = Readonly<{
  kind: string
  attributeName: string
  declaration: string
  text: string
}>

export type MethodGuideRenderInput = Readonly<{
  document: ClassModelDocument
  kind: string
  methodName: string
  componentCatalog?: ComponentCatalogLike
  componentType?: string
}>

export type MethodGuide = Readonly<{
  kind: string
  methodName: string
  declaration: string
  text: string
}>

export type ComponentCatalogLike = Readonly<{
  components?: Readonly<Record<string, ComponentCatalogEntryLike>>
}>

type ComponentCatalogEntryLike = Readonly<{
  type?: string
  description?: string
  props?: readonly ComponentPropLike[]
}>

type ComponentPropLike = Readonly<{
  name?: string
  typeText?: string
  required?: boolean
  description?: string
}>

export function renderClassModelDeclaration(model: ClassModel): string {
  const parts: string[] = []
  parts.push(renderJsDocMeta(model.jsdoc))
  parts.push(`class ${model.className} {`)
  if (model.constructor !== undefined) {
    parts.push(indent(renderJsDocMeta(model.constructor.jsdoc)))
    parts.push(indent(model.constructor.declaration))
  }
  for (const attribute of model.attributes) {
    parts.push(indent(renderAttributeDeclaration(attribute)))
  }
  for (const method of model.methods) {
    parts.push(indent(renderMethodDeclaration(method)))
  }
  parts.push('}')
  return parts.filter(part => part.length > 0).join('\n')
}

export function renderModelGuide(input: ModelGuideRenderInput): ModelGuide {
  const model = modelByKind(input.document, input.kind)
  const text = renderClassModelDeclaration(model)
  return {
    kind: input.kind,
    declaration: model.declaration,
    text,
  }
}

export function renderAttributeGuide(input: AttributeGuideRenderInput): AttributeGuide {
  const model = modelByKind(input.document, input.kind)
  const attribute = model.attributes.find(candidate => candidate.name === input.attributeName)
  if (attribute === undefined) throw new Error(`ClassModel attribute not found: ${input.kind}.${input.attributeName}`)

  const text = [
    renderJsDocMeta(model.jsdoc),
    `class ${model.className} {`,
    indent(renderAttributeDeclaration(attribute)),
    '}',
  ].join('\n')

  return {
    kind: input.kind,
    attributeName: input.attributeName,
    declaration: attribute.declaration,
    text,
  }
}

export function renderMethodGuide(input: MethodGuideRenderInput): MethodGuide {
  const model = modelByKind(input.document, input.kind)
  const method = model.methods.find(candidate => candidate.name === input.methodName)
  if (method === undefined) throw new Error(`ClassModel method not found: ${input.kind}.${input.methodName}`)

  // d.ts-like 文本只在给 LLM guide 前即时渲染，不写入 generated JSON 真源。
  const chunks = [
    renderJsDocMeta(model.jsdoc),
    `class ${model.className} {`,
    indent(renderMethodDeclaration(method)),
    '}',
  ]

  const componentDeclaration = input.componentType === undefined || input.componentCatalog === undefined
    ? undefined
    : renderComponentPropsDeclaration(input.componentCatalog, input.componentType)
  if (componentDeclaration !== undefined) {
    chunks.push('', componentDeclaration)
  }

  const text = chunks.join('\n')
  return {
    kind: input.kind,
    methodName: input.methodName,
    declaration: method.declaration,
    text,
  }
}

export function renderMethodDeclaration(method: MethodMeta): string {
  return [
    renderJsDocMeta(method.jsdoc),
    method.declaration,
  ].filter(part => part.length > 0).join('\n')
}

export function renderAttributeDeclaration(attribute: AttributeMeta): string {
  return [
    renderJsDocMeta(attribute.jsdoc),
    attribute.declaration,
  ].filter(part => part.length > 0).join('\n')
}

export function renderComponentPropsDeclaration(
  catalog: ComponentCatalogLike,
  componentType: string,
): string | undefined {
  const component = catalog.components?.[componentType]
  if (component === undefined) return undefined
  const typeName = componentTypeToPropsTypeName(componentType)
  const lines: string[] = []
  lines.push(renderJsDoc(component.description ?? `${componentType} props.`))
  lines.push(`type ${typeName} = {`)
  for (const prop of component.props ?? []) {
    if (prop.name === undefined) continue
    const optional = prop.required === true ? '' : '?'
    const propType = prop.typeText ?? 'unknown'
    lines.push(indent(renderJsDoc(prop.description ?? prop.name)))
    lines.push(indent(`${prop.name}${optional}: ${propType}`))
  }
  lines.push('}')
  return lines.join('\n')
}

function modelByKind(document: ClassModelDocument, kind: string): ClassModel {
  const model = document.models[kind]
  if (model === undefined) throw new Error(`ClassModel kind not found: ${kind}`)
  return model
}

function renderJsDocMeta(jsdoc: JsDocMeta): string {
  const raw = jsdoc.raw?.trim()
  if (raw !== undefined && raw.length > 0) return raw
  return renderJsDoc(jsdoc.summary, jsdoc.tags.map(renderJsDocTag))
}

function renderJsDocTag(tag: JsDocMeta['tags'][number]): string {
  if (tag.name === 'param' && tag.paramName !== undefined) {
    return `@${tag.name} ${tag.paramName}${tag.text.length === 0 ? '' : ` ${tag.text}`}`
  }
  return `@${tag.name}${tag.text.length === 0 ? '' : ` ${tag.text}`}`
}

function renderJsDoc(summary: string, tags: readonly string[] = []): string {
  const lines = [summary, ...tags].filter(line => line.trim().length > 0)
  if (lines.length === 0) return ''
  if (lines.length === 1) return `/** ${lines[0]} */`
  return [
    '/**',
    ...lines.map(line => ` * ${line}`),
    ' */',
  ].join('\n')
}

function componentTypeToPropsTypeName(type: string): string {
  return `${type.split('-').filter(part => part.length > 0).map(capitalize).join('')}Props`
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`
}

function indent(value: string): string {
  return value.split('\n').map(line => (line.length === 0 ? line : `  ${line}`)).join('\n')
}
