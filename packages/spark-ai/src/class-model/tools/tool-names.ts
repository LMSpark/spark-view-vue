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

export type ClassModelToolName = typeof CLASS_MODEL_TOOL_NAMES[keyof typeof CLASS_MODEL_TOOL_NAMES]

export function isClassModelToolName(name: string): name is ClassModelToolName {
  return Object.values(CLASS_MODEL_TOOL_NAMES).some(candidate => candidate === name)
}
