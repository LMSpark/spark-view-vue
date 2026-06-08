/**
 * VCM-native 的 OpenAI tool 闭集。
 *
 * 注意：这里才是 OpenAI tool 名；ClassModel.methods 只是源码 class
 * public methods 的反射结果，二者不要混用。
 */
export const VCM_NATIVE_TOOL_NAMES = Object.freeze({
  query: 'vcm_query',
  modelGuide: 'vcm_model_guide',
  attributeGuide: 'vcm_attribute_guide',
  actionGuide: 'vcm_action_guide',
  script: 'vcm_script',
  humanQuestion: 'human_question',
  agentComplete: 'agent_complete',
} as const)

export type VcmNativeToolName = typeof VCM_NATIVE_TOOL_NAMES[keyof typeof VCM_NATIVE_TOOL_NAMES]

export function isVcmNativeToolName(name: string): name is VcmNativeToolName {
  return Object.values(VCM_NATIVE_TOOL_NAMES).some(candidate => candidate === name)
}
