/** @see docs/ai/AI_MODEL_SPEC.md */

/** AI 可编辑模型协议基类。协议只强制 toJson；save/load/fromJson 由子类按需添加。 */
export abstract class SparkAIModel {
    /** 创建 Spark AIModel 实例。 */
constructor(_options: Record<string, unknown>) {
    void _options
  }

    /** 执行 to Json 操作。 */
abstract toJson(): Record<string, unknown>
}
