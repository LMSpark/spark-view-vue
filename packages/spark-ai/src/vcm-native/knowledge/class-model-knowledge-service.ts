import type { AiJsonValue } from '../../json'
import type { ClassModelDocument } from '../class-model'
import {
  renderAttributeTypeText,
  renderMethodSignature,
} from '../class-model/signature-renderer'
import {
  renderAttributeGuide,
  renderMethodGuide,
  renderModelGuide,
  type ComponentCatalogLike,
} from '../projection'

export type VcmNativeKnowledgeQueryInput = Readonly<{
  kind?: string
  keyword?: string
  includeMembers: boolean
}>

export type VcmNativeModelGuideInput = Readonly<{
  kind: string
}>

export type VcmNativeAttributeGuideInput = Readonly<{
  kind: string
  attributeName: string
}>

export type VcmNativeMethodGuideInput = Readonly<{
  kind: string
  methodName: string
  componentType?: string
}>

export type VcmNativeKnowledgeProvider = Readonly<{
  query(input: VcmNativeKnowledgeQueryInput): AiJsonValue | Promise<AiJsonValue>
  modelGuide(input: VcmNativeModelGuideInput): string | Promise<string>
  attributeGuide(input: VcmNativeAttributeGuideInput): string | Promise<string>
  methodGuide(input: VcmNativeMethodGuideInput): string | Promise<string>
}>

export type ClassModelKnowledgeServiceOptions = Readonly<{
  document: ClassModelDocument
  componentCatalog?: ComponentCatalogLike
}>

/**
 * ClassModel 知识查询服务。
 *
 * 这里是“知识/索引/投影”边界，不是 tool runtime：
 * - 可以直接在主线程使用；
 * - 也可以被 Web Worker 包一层，通过消息协议远程调用；
 * - 不执行 vcm_script，不处理 agent 生命周期。
 */
export class ClassModelKnowledgeService implements VcmNativeKnowledgeProvider {
  private readonly document: ClassModelDocument
  private readonly componentCatalog?: ComponentCatalogLike

  public constructor(options: ClassModelKnowledgeServiceOptions) {
    this.document = options.document
    if (options.componentCatalog !== undefined) this.componentCatalog = options.componentCatalog
  }

  public query(input: VcmNativeKnowledgeQueryInput): AiJsonValue {
    const keyword = input.keyword?.toLowerCase()
    const models = Object.values(this.document.models)
      .filter(model => input.kind === undefined || model.kind === input.kind)
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
                typeText: renderAttributeTypeText(this.document, attribute),
              })),
              methods: model.methods.map(method => ({
                name: method.name,
                summary: summarizeJsDoc(method.jsdoc),
                signature: renderMethodSignature(this.document, method),
              })),
            }
          : {}),
      }))

    return {
      rootKind: this.document.rootKind,
      models,
    }
  }

  public modelGuide(input: VcmNativeModelGuideInput): string {
    return renderModelGuide({
      document: this.document,
      kind: input.kind,
    }).text
  }

  public attributeGuide(input: VcmNativeAttributeGuideInput): string {
    return renderAttributeGuide({
      document: this.document,
      kind: input.kind,
      attributeName: input.attributeName,
    }).text
  }

  public methodGuide(input: VcmNativeMethodGuideInput): string {
    return renderMethodGuide({
      document: this.document,
      kind: input.kind,
      methodName: input.methodName,
      ...(this.componentCatalog === undefined ? {} : { componentCatalog: this.componentCatalog }),
      ...(input.componentType === undefined ? {} : { componentType: input.componentType }),
    }).text
  }
}

function modelMatchesKeyword(
  model: ClassModelDocument['models'][string],
  keyword: string,
): boolean {
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
