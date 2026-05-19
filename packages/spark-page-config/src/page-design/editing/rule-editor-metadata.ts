import type { JsonObject } from '../../json-document'

export interface RuleEditorComponentMetadata {
  types: string[]
  propNames: Record<string, string[]>
  propEnums: Record<string, Record<string, string[]>>
  typeLabels: Record<string, string>
  requiredProps: Record<string, JsonObject>
}

export const EMPTY_RULE_EDITOR_COMPONENT_METADATA: RuleEditorComponentMetadata = {
  types: [],
  propNames: {},
  propEnums: {},
  typeLabels: {},
  requiredProps: {},
}
