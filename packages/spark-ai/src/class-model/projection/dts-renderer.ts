/**
 * @module @spark-appworks/spark-ai:class-model/projection/dts-renderer
 * 职责：维护 DTS ClassModel 知识链路中的 dts-renderer 能力，围绕 ModelGuideRenderInput、ModelGuide、AttributeGuideRenderInput 等 6 个公开契约 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不回退到 VCM，也不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/projection/dts-renderer 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { AttributeMeta, ClassModel, ClassModelDocument, JsDocMeta, MethodMeta } from '../class-model'
import { projectClassModelForGuide } from '../class-model/model-projection'
import {
  renderAttributeDeclarationLine,
  renderConstructorSignature,
  renderMethodDeclarationLine,
} from '../class-model/signature-renderer'

/** Model Guide Render Input 的输入数据。 */
export type ModelGuideRenderInput = Readonly<{
  document: ClassModelDocument
  kind: string
}>

/** Model Guide 的语义模型。 */
export type ModelGuide = Readonly<{
  kind: string
  declaration: string
  text: string
}>

/** Attribute Guide Render Input 的输入数据。 */
export type AttributeGuideRenderInput = Readonly<{
  document: ClassModelDocument
  kind: string
  attributeName: string
}>

/** Attribute Guide 的语义模型。 */
export type AttributeGuide = Readonly<{
  kind: string
  attributeName: string
  declaration: string
  text: string
}>

/** Method Guide Render Input 的输入数据。 */
export type MethodGuideRenderInput = Readonly<{
  document: ClassModelDocument
  kind: string
  methodName: string
}>

/** Method Guide 的语义模型。 */
export type MethodGuide = Readonly<{
  kind: string
  methodName: string
  declaration: string
  text: string
}>

export function renderClassModelDeclaration(
  document: ClassModelDocument,
  model: ClassModel,
): string {
  const parts: string[] = []
  parts.push(renderJsDocMeta(model.jsdoc))
  parts.push(`class ${model.className} {`)
  if (model.constructorMeta !== undefined) {
    parts.push(indent(renderJsDocMeta(model.constructorMeta.jsdoc)))
    parts.push(indent(renderConstructorSignature(model.constructorMeta)))
  }
  for (const attribute of model.attributes) {
    parts.push(indent(renderAttributeDeclaration(document, model.kind, attribute)))
  }
  for (const method of model.methods) {
    parts.push(indent(renderMethodDeclaration(document, model.kind, method)))
  }
  parts.push('}')
  return parts.filter(part => part.length > 0).join('\n')
}

export function renderModelGuide(input: ModelGuideRenderInput): ModelGuide {
  const model = projectClassModelForGuide(input.document, input.kind)
  const text = renderClassModelDeclaration(input.document, model)
  return {
    kind: input.kind,
    declaration: `class ${model.className}`,
    text,
  }
}

export function renderAttributeGuide(input: AttributeGuideRenderInput): AttributeGuide {
  const model = projectClassModelForGuide(input.document, input.kind)
  const attribute = model.attributes.find(candidate => candidate.name === input.attributeName)
  if (attribute === undefined) throw new Error(`ClassModel attribute not found: ${input.kind}.${input.attributeName}`)

  const declarationLine = renderAttributeDeclarationLine(input.document, input.kind, attribute)
  const text = [
    renderJsDocMeta(model.jsdoc),
    `class ${model.className} {`,
    indent(renderAttributeDeclaration(input.document, input.kind, attribute)),
    '}',
  ].join('\n')

  return {
    kind: input.kind,
    attributeName: input.attributeName,
    declaration: declarationLine,
    text,
  }
}

export function renderMethodGuide(input: MethodGuideRenderInput): MethodGuide {
  const model = projectClassModelForGuide(input.document, input.kind)
  const method = model.methods.find(candidate => candidate.name === input.methodName)
  if (method === undefined) throw new Error(`ClassModel method not found: ${input.kind}.${input.methodName}`)

  const declarationLine = renderMethodDeclarationLine(input.document, input.kind, method)
  const text = [
    renderJsDocMeta(model.jsdoc),
    `class ${model.className} {`,
    indent(renderMethodDeclaration(input.document, input.kind, method)),
    '}',
  ].join('\n')
  return {
    kind: input.kind,
    methodName: input.methodName,
    declaration: declarationLine,
    text,
  }
}

export function renderMethodDeclaration(
  document: ClassModelDocument,
  ownerKind: string,
  method: MethodMeta,
): string {
  return [
    renderJsDocMeta(method.jsdoc),
    renderMethodDeclarationLine(document, ownerKind, method),
  ].filter(part => part.length > 0).join('\n')
}

export function renderAttributeDeclaration(
  document: ClassModelDocument,
  ownerKind: string,
  attribute: AttributeMeta,
): string {
  return [
    renderJsDocMeta(attribute.jsdoc),
    renderAttributeDeclarationLine(document, ownerKind, attribute),
  ].filter(part => part.length > 0).join('\n')
}

function renderJsDocMeta(jsdoc: JsDocMeta): string {
  return jsdoc.trim()
}

function indent(value: string): string {
  return value.split('\n').map(line => (line.length === 0 ? line : `  ${line}`)).join('\n')
}
