import type {
  AiRuntimeKnowledgeProjection,
  AiRuntimeProjectKnowledgeOptions,
} from '../../protocol/runtime-contracts'
import { AiKnowledgeProjector } from '../knowledge/knowledge-projection'
import type { AiKnowledgeProjection } from '../knowledge/knowledge-projection'
import type { AiRuntimeProjector } from './ai-runtime-support'
import type { AiRegistrationRepository } from './ai-registration-repository'
import type { AiSessionLedger } from './ai-session-ledger'

export class AiProjectionService {
  private readonly knowledgeProjector = new AiKnowledgeProjector()

  constructor(
    private readonly registrations: AiRegistrationRepository,
    private readonly sessions: AiSessionLedger,
    private readonly projector: AiRuntimeProjector,
  ) {}

  getKnowledgeProjection(): AiKnowledgeProjection {
    return this.knowledgeProjector
  }

  async projectKnowledge(options: AiRuntimeProjectKnowledgeOptions): Promise<AiRuntimeKnowledgeProjection> {
    const scope = this.sessions.normalizeScope(options)
    const module = this.registrations.getModuleOrThrow(scope.moduleId)
    const exposure = await this.projector.projectModule(module, scope)
    const availableFunctions = this.projector.flattenFunctions(exposure)
    const projection = {
      scope,
      module: this.projector.cloneModuleExposure(exposure),
      promptSnapshot: this.projector.buildPromptSnapshot(exposure),
      availableFunctions: this.projector.cloneExposure(availableFunctions),
    }
    this.knowledgeProjector.updateProjection({
      scope,
      availableFunctions: projection.availableFunctions,
      module: projection.module,
    })
    return projection
  }
}
