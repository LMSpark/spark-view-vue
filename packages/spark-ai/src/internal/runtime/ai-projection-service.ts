/**
 * AI 知识投射服务。
 *
 * 职责：将模块注册信息投影为 LLM 可用的知识，并缓存到 AiKnowledgeProjector。
 * 投影是知识查询的前置步骤，在 startSession 或显式调用 projectKnowledge 时触发。
 *
 * 投射流程：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. projectKnowledge(options)                                  │
 * │    ├─ ① sessions.normalizeScope(options)                      │
 * │    │   → 归一化 scope（补全 instanceId 等字段）                │
 * │    ├─ ② registrations.getModuleOrThrow(scope.moduleId)        │
 * │    │   → 查找模块注册树，不存在则抛出                          │
 * │    ├─ ③ projector.projectModule(module, scope)                │
 * │    │   → 将注册树投影为 LLM 可见的模块曝光树                   │
 * │    │   → 注入上下文参数 schema、拼接 action 字符串             │
 * │    ├─ ④ projector.flattenFunctions(exposure)                  │
 * │    │   → 展平模块树中的所有函数为扁平列表                      │
 * │    ├─ ⑤ projector.buildPromptSnapshot(exposure)               │
 * │    │   → 聚合模块树中的 prompt 文本                            │
 * │    ├─ ⑥ projector.cloneModuleExposure / cloneExposure         │
 * │    │   → 深拷贝曝光数据，防止外部修改注册源                    │
 * │    └─ ⑦ knowledgeProjector.updateProjection()                 │
 * │        → 更新全局投影缓存                                     │
 * │                                                               │
 * │ 2. getKnowledgeProjection() → 返回全局缓存                     │
 * │    → 用于查询所有已注册模块的函数和模块信息                     │
 * └──────────────────────────────────────────────────────────────┘
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
  /** 全局知识投影缓存，支持跨模块查询 */
  private readonly knowledgeProjector = new AiKnowledgeProjector()

  constructor(
    private readonly registrations: AiRegistrationRepository,
    private readonly sessions: AiSessionLedger,
    private readonly projector: AiRuntimeProjector,
  ) {}

  /**
   * 获取全局知识投射缓存。
   * 返回的 AiKnowledgeProjector 包含所有已投影模块的知识快照，
   * 可用于查询函数摘要、模块目录等，不绑定特定会话。
   */
  getKnowledgeProjection(): AiKnowledgeProjector {
    return this.knowledgeProjector
  }

  /**
   * 投射模块知识到 LLM 可用的格式。
   *
   * 流程说明：
   * 1. 归一化 scope：从调用方传入的选项补全完整的实例上下文
   * 2. 查找模块注册：从仓库中获取模块注册树，不存在则抛出
   * 3. 投影模块树：将注册树转换为 LLM 可见的曝光树
   *    - 注入上下文参数到函数 schema（如 moduleInstanceId 参数）
   *    - 拼接 action 字符串（rootInstance/childInstance@module@actionName）
   *    - 聚合模块 prompt 文本
   * 4. 展平函数：将递归模块树中的所有函数提取为扁平列表
   * 5. 深拷贝：防止调用方修改投影数据影响注册源
   * 6. 更新缓存：将投影结果存入全局知识投影缓存
   *
   * 返回值包含：
   * - scope: 归一化后的会话作用域
   * - module: 模块曝光树（可递归查询子模块）
   * - promptSnapshot: 聚合后的提示词文本
   * - availableFunctions: 扁平函数列表（LLM 可选用的全部工具）
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
