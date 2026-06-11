import type { AiJsonValue } from '../../json'
import type { DtsClassModelBundleLoader } from '../class-model/dts-class-model-bundle-loader'
import {
  ClassModelKnowledgeService,
  type ClassModelAttributeGuideInput,
  type ClassModelKnowledgeProvider,
  type ClassModelKnowledgeQueryInput,
  type ClassModelMethodGuideInput,
  type ClassModelModelGuideInput,
} from './class-model-knowledge-service'

export type DtsBundleClassModelKnowledgeServiceOptions = Readonly<{
  loader: DtsClassModelBundleLoader
  rootClassName: string
}>

export class DtsBundleClassModelKnowledgeService implements ClassModelKnowledgeProvider {
  public constructor(private readonly options: DtsBundleClassModelKnowledgeServiceOptions) {}

  public async query(input: ClassModelKnowledgeQueryInput): Promise<AiJsonValue> {
    await this.loadForInput(input.kind)
    return this.delegate().query(input)
  }

  public async modelGuide(input: ClassModelModelGuideInput): Promise<string> {
    await this.loadForInput(input.kind)
    return this.delegate().modelGuide(input)
  }

  public async attributeGuide(input: ClassModelAttributeGuideInput): Promise<string> {
    await this.loadForInput(input.kind)
    return this.delegate().attributeGuide(input)
  }

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
