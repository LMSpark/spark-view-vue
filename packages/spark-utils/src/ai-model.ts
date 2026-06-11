/** @see docs/ai/AI_MODEL_SPEC.md */

/** AI 可编辑模型协议基类。协议只强制 toJson；save/load/fromJson 由子类按需添加。 */
export abstract class SparkAIModel {
  constructor(_options: Record<string, unknown>) {
    void _options
  }

  abstract toJson(): Record<string, unknown>
}
