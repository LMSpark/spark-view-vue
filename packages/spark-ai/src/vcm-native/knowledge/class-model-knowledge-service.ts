import type { AiJsonValue } from '../../json'
import type { ClassModelDocument } from '../class-model'
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
        name: model.name,
        summary: model.jsdoc.summary,
        childModels: uniqueStrings(model.methods.flatMap(method => method.childModels.map(child => child.targetKind))),
        ...(input.includeMembers
          ? {
              attributes: model.attributes.map(attribute => ({
                name: attribute.name,
                summary: attribute.jsdoc.summary,
                typeText: attribute.typeText,
              })),
              methods: model.methods.map(method => ({
                name: method.name,
                summary: method.jsdoc.summary,
                signature: method.signature,
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
    model.name,
    model.jsdoc.summary,
    ...model.attributes.flatMap(attribute => [attribute.name, attribute.jsdoc.summary]),
    ...model.methods.flatMap(method => [method.name, method.jsdoc.summary]),
  ]
  return haystacks.some(value => value.toLowerCase().includes(keyword))
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}
