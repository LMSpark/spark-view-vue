/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/dts-bundle-class-model-knowledge-service
 * 职责：维护 DTS ClassModel 知识链路中的 dts-bundle-class-model-knowledge-service 能力，围绕 DtsBundleClassModelKnowledgeServiceOptions、DtsBundleClassModelKnowledgeService 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/knowledge/dts-bundle-class-model-knowledge-service 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { AiJsonValue } from '../../json'
import { DtsClassModelBundleLoader } from '../class-model/dts-class-model-bundle-loader'
import {
  ClassModelKnowledgeService,
  type ClassModelAttributeGuideInput,
  type ClassModelKnowledgeProvider,
  type ClassModelKnowledgeQueryInput,
  type ClassModelMethodGuideInput,
  type ClassModelModelGuideInput,
} from './class-model-knowledge-service'

/** Dts Bundle Class Model Knowledge Service Options 的调用配置。 */
export type DtsBundleClassModelKnowledgeServiceOptions = Readonly<{
  loader: DtsClassModelBundleLoader
  rootClassName: string
}>

/** Create Dts Bundle Class Model Knowledge Provider Options 的调用配置。 */
export type CreateDtsBundleClassModelKnowledgeProviderOptions = Readonly<{
  dtsClassModelManifestUrl: string
  rootClassName: string
  fetchJson?: (url: string) => Promise<unknown>
}>

export function createDtsBundleClassModelKnowledgeProvider(
  options: CreateDtsBundleClassModelKnowledgeProviderOptions,
): DtsBundleClassModelKnowledgeService {
  const dtsClassModelManifestUrl = normalizeRequiredText(
    options.dtsClassModelManifestUrl,
    'dtsClassModelManifestUrl',
  )
  const rootClassName = normalizeRequiredText(options.rootClassName, 'rootClassName')
  const loader = new DtsClassModelBundleLoader({
    manifestUrl: dtsClassModelManifestUrl,
    ...(options.fetchJson === undefined ? {} : { fetchJson: options.fetchJson }),
  })
  return new DtsBundleClassModelKnowledgeService({
    loader,
    rootClassName,
  })
}

/** Dts Bundle Class Model Knowledge Service 的语义模型。 */
export class DtsBundleClassModelKnowledgeService implements ClassModelKnowledgeProvider {
    /** 创建 Dts Bundle Class Model Knowledge Service 实例。 */
public constructor(private readonly options: DtsBundleClassModelKnowledgeServiceOptions) {}

    /** 初始化 manifest，保持动态加载入口 fail-fast。 */
public async init(): Promise<void> {
    await this.options.loader.init()
  }

    /** 查询参数。 */
public async query(input: ClassModelKnowledgeQueryInput): Promise<AiJsonValue> {
    await this.loadForInput(input.kind)
    return this.delegate().query(input)
  }

    /** 执行 model Guide 操作。 */
public async modelGuide(input: ClassModelModelGuideInput): Promise<string> {
    await this.loadForInput(input.kind)
    return this.delegate().modelGuide(input)
  }

    /** 执行 attribute Guide 操作。 */
public async attributeGuide(input: ClassModelAttributeGuideInput): Promise<string> {
    await this.loadForInput(input.kind)
    return this.delegate().attributeGuide(input)
  }

    /** 执行 method Guide 操作。 */
public async methodGuide(input: ClassModelMethodGuideInput): Promise<string> {
    await this.loadForInput(input.kind)
    return this.delegate().methodGuide(input)
  }

  private async loadForInput(className: string | undefined): Promise<void> {
    await this.options.loader.ensureReachableClosure(this.options.rootClassName)
    if (className !== undefined) await this.options.loader.ensureClassName(className)
  }

  private delegate(): ClassModelKnowledgeService {
    return new ClassModelKnowledgeService({
      surface: this.options.loader.buildLoadedSurface(),
      rootClassName: this.options.rootClassName,
    })
  }
}

function normalizeRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`DTS ClassModel knowledge requires ${field}.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`DTS ClassModel knowledge requires ${field}.`)
  }
  return trimmed
}
