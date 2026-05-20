/**
 * AI 知识投射服务。
 *
 * 职责：将模块注册信息投影为 LLM 可用的知识，并缓存到 AiKnowledgeProjector。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │               AiProjectionService                     │
 * │                                                       │
 * │  projectKnowledge()                                   │
 * │    ├─ normalizeScope()                                │
 * │    ├─ AiRuntimeProjector.projectModule() → 模块曝光树   │
 * │    ├─ flattenFunctions() → 扁平函数列表                 │
 * │    ├─ buildPromptSnapshot() → 提示词聚合               │
 * │    └─ AiKnowledgeProjector.updateProjection() → 缓存   │
 * │                                                       │
 * │  getKnowledgeProjection() → 返回全局缓存                │
 * └──────────────────────────────────────────────────────┘
 */

import type {
  AiRuntimeKnowledgeProjection,
  AiRuntimeProjectKnowledgeOptions,
} from '../../protocol/runtime-contracts'
import { AiKnowledgeProjector } from '../knowledge/knowledge-projection'
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

  /** 获取全局知识投射缓存 */
  getKnowledgeProjection(): AiKnowledgeProjector {
    return this.knowledgeProjector
  }

  /**
   * 投射模块知识。
   * 流程：归一化 scope → 获取注册 → 投影模块树 → 展平函数 → 构建 prompt → 更新缓存。
   */
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
