import type { AiJsonValue } from '../../json'
import type { ClassModelDocument } from '../class-model'
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
  type ComponentCatalogLike,
} from '../projection'

export type VcmNativeKnowledgeQueryInput = Readonly<{
  className?: string
  keyword?: string
  includeMembers: boolean
}>

export type VcmNativeModelGuideInput = Readonly<{
  className: string
}>

export type VcmNativeAttributeGuideInput = Readonly<{
  className: string
  attributeName: string
}>

export type VcmNativeMethodGuideInput = Readonly<{
  className: string
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

export class ClassModelKnowledgeService implements VcmNativeKnowledgeProvider {
  private readonly document: ClassModelDocument
  private readonly componentCatalog?: ComponentCatalogLike

  public constructor(options: ClassModelKnowledgeServiceOptions) {
    this.document = options.document
    if (options.componentCatalog !== undefined) this.componentCatalog = options.componentCatalog
  }

  public query(input: VcmNativeKnowledgeQueryInput): AiJsonValue {
    const keyword = input.keyword?.toLowerCase()
    const filterClassName = input.className
    const models = listAttributeReachableKinds(this.document)
      .filter(className => filterClassName === undefined || className === filterClassName)
      .map(className => projectClassModelForGuide(this.document, className))
      .filter(model => keyword === undefined || modelMatchesKeyword(model, keyword))
      .map(model => ({
        className: model.className,
        summary: summarizeJsDoc(model.jsdoc),
        ...(input.includeMembers
          ? {
              attributes: model.attributes.map(attribute => ({
                name: attribute.name,
                summary: summarizeJsDoc(attribute.jsdoc),
                typeText: renderAttributeTypeText(this.document, model.kind, attribute),
              })),
              methods: model.methods.map(method => ({
                name: method.name,
                summary: summarizeJsDoc(method.jsdoc),
                signature: renderMethodSignature(this.document, model.kind, method),
              })),
            }
          : {}),
      }))

    return {
      rootClassName: this.document.rootKind,
      models,
    }
  }

  public modelGuide(input: VcmNativeModelGuideInput): string {
    return renderModelGuide({
      document: this.document,
      kind: input.className,
    }).text
  }

  public attributeGuide(input: VcmNativeAttributeGuideInput): string {
    return renderAttributeGuide({
      document: this.document,
      kind: input.className,
      attributeName: input.attributeName,
    }).text
  }

  public methodGuide(input: VcmNativeMethodGuideInput): string {
    return renderMethodGuide({
      document: this.document,
      kind: input.className,
      methodName: input.methodName,
      ...(this.componentCatalog === undefined ? {} : { componentCatalog: this.componentCatalog }),
      ...(input.componentType === undefined ? {} : { componentType: input.componentType }),
    }).text
  }
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
