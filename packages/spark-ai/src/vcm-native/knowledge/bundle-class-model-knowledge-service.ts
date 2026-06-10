import { createClassModelDocumentFromModuleMetadata } from '../class-model'
import type { ClassModelDocument } from '../class-model'
import {
  assembleRuntimeModuleFromBundle,
  expandBundleKindsWithImportKinds,
} from '../metadata/vcm-bundle-assembler'
import type { VcmBundleLoader } from '../metadata/vcm-bundle-loader'
import type { ComponentCatalogLike } from '../projection'
import {
  ClassModelKnowledgeService,
  type VcmNativeAttributeGuideInput,
  type VcmNativeKnowledgeProvider,
  type VcmNativeKnowledgeQueryInput,
  type VcmNativeMethodGuideInput,
  type VcmNativeModelGuideInput,
} from './class-model-knowledge-service'

export type BundleClassModelKnowledgeServiceOptions = Readonly<{
  loader: VcmBundleLoader
  componentCatalog?: ComponentCatalogLike
}>

/**
 * 基于 VCM bundle 按需加载的 knowledge provider。
 *
 * query / guide 在调用前只 ensure 必要的 kind 文件，避免 Worker init 拉取整包 metadata。
 */
export class BundleClassModelKnowledgeService implements VcmNativeKnowledgeProvider {
  private readonly loader: VcmBundleLoader
  private readonly componentCatalog?: ComponentCatalogLike

  public constructor(options: BundleClassModelKnowledgeServiceOptions) {
    this.loader = options.loader
    if (options.componentCatalog !== undefined) this.componentCatalog = options.componentCatalog
  }

  public async query(input: VcmNativeKnowledgeQueryInput) {
    await this.loader.ensureReachableFromRoot()
    const document = await this.buildDocument({ includeAllReachable: true })
    return this.delegate(document).query(input)
  }

  public async modelGuide(input: VcmNativeModelGuideInput): Promise<string> {
    const document = await this.buildDocument({ kind: input.kind, includeAllReachable: false })
    return this.delegate(document).modelGuide(input)
  }

  public async attributeGuide(input: VcmNativeAttributeGuideInput): Promise<string> {
    const document = await this.buildDocument({ kind: input.kind, includeAllReachable: false })
    return this.delegate(document).attributeGuide(input)
  }

  public async methodGuide(input: VcmNativeMethodGuideInput): Promise<string> {
    const document = await this.buildDocument({ kind: input.kind, includeAllReachable: false })
    return this.delegate(document).methodGuide(input)
  }

  private delegate(document: ClassModelDocument): ClassModelKnowledgeService {
    return new ClassModelKnowledgeService({
      document,
      ...(this.componentCatalog === undefined ? {} : { componentCatalog: this.componentCatalog }),
    })
  }

  private async buildDocument(command: Readonly<{
    kind?: string
    includeAllReachable?: boolean
  }>): Promise<ClassModelDocument> {
    const manifest = await this.loader.init()
    const defs = await this.loader.getSchemaDefs()
    const baseKinds = command.includeAllReachable === true
      ? await this.loader.listAttributeReachableKinds()
      : command.kind === undefined
        ? [manifest.rootKind]
        : [manifest.rootKind, command.kind]
    const kindsToLoad = expandBundleKindsWithImportKinds(manifest, baseKinds)
    await this.loader.ensureKinds(kindsToLoad)
    const kinds: Record<string, Awaited<ReturnType<VcmBundleLoader['ensureKind']>>> = {}
    for (const loadedKind of kindsToLoad) {
      kinds[loadedKind] = await this.loader.ensureKind(loadedKind)
    }
    const assembled = assembleRuntimeModuleFromBundle({ manifest, defs, kinds })
    return createClassModelDocumentFromModuleMetadata({
      module: assembled.module,
      schemaDefs: assembled.$defs,
    })
  }
}
