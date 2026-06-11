/** @see docs/ai/AI_MODEL_SPEC.md */

/**
 * AI 可编辑模型协议基类。
 *
 * 协议强制：`toJson`、`validate`（结束编辑依据）。
 * AI 寻址靠子类 **公开字段链** 与 `属性[下标]`。
 * 只有一套 AI 模型栈；禁止 DataSet/SparkNodeTree 等快照第二编辑面。
 */
export abstract class SparkAIModel {
  constructor(_options: Record<string, unknown>) {
    void _options
  }

  abstract toJson(): Record<string, unknown>

  /**
   * 校验当前内存态是否可结束编辑。
   *
   * 通过则无返回值；失败 `throw`。持久化前须先调用；AI / UI 结束一轮编辑前亦应调用。
   */
  abstract validate(): void
}
