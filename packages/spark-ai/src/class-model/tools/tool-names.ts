/**
 * @module @spark-appworks/spark-ai:class-model/tools/tool-names
 * @spark-appworks/spark-ai 的 class-model/tools/tool-names 模块。
 * 导出 ClassModel symbol: ClassModelToolName（共 1 个 symbol）。
 */
/**
 * ClassModel 的 OpenAI tool 闭集。
 *
 * 注意：这里才是 OpenAI tool 名；ClassModel.methods 只是源码 class
 * public methods 的反射结果，二者不要混用。
 */
export const CLASS_MODEL_TOOL_NAMES = Object.freeze({
  query: 'model_query',
  modelGuide: 'model_class_guide',
  attributeGuide: 'model_attribute_guide',
  actionGuide: 'model_action_guide',
  script: 'model_script',
  humanQuestion: 'human_question',
  agentComplete: 'agent_complete',
} as const)

/** Class Model Tool Name 的语义模型。 */
export type ClassModelToolName = typeof CLASS_MODEL_TOOL_NAMES[keyof typeof CLASS_MODEL_TOOL_NAMES]

export function isClassModelToolName(name: string): name is ClassModelToolName {
  return Object.values(CLASS_MODEL_TOOL_NAMES).some(candidate => candidate === name)
}
