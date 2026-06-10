import { describe, expect, it } from 'vitest'

import { buildVcmNativeToolSchemaRecoveryHint } from '../tools/vcm-native-tool-schema-recovery'
import { VCM_NATIVE_TOOL_NAMES } from '../tools/tool-names'

describe('buildVcmNativeToolSchemaRecoveryHint', () => {
  it('derives vcm_query allowed params from native tool schema', () => {
    const hint = buildVcmNativeToolSchemaRecoveryHint(VCM_NATIVE_TOOL_NAMES.query)
    expect(hint).toContain('kind')
    expect(hint).toContain('keyword')
    expect(hint).toContain('includeMembers')
    expect(hint).not.toMatch(/\bmember\s*\(/u)
  })

  it('derives vcm_model_guide required kind from native tool schema', () => {
    const hint = buildVcmNativeToolSchemaRecoveryHint(VCM_NATIVE_TOOL_NAMES.modelGuide)
    expect(hint).toContain('kind (required')
    expect(hint).not.toContain('modelName')
  })

  it('derives vcm_attribute_guide kind and attributeName from native tool schema', () => {
    const hint = buildVcmNativeToolSchemaRecoveryHint(VCM_NATIVE_TOOL_NAMES.attributeGuide)
    expect(hint).toContain('attributeName (required')
    expect(hint).not.toContain('className')
  })
})
