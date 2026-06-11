import type { AiJsonSchemaObject } from '../../json'
import { CLASS_MODEL_TOOL_NAMES, type ClassModelToolName } from './tool-names'

export type ClassModelToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: AiJsonSchemaObject
  }
}>

export function listClassModelToolSpecs(): readonly ClassModelToolSpec[] {
  return [
    buildVcmQueryTool(),
    buildVcmModelGuideTool(),
    buildVcmAttributeGuideTool(),
    buildVcmActionGuideTool(),
    buildVcmScriptTool(),
    buildHumanQuestionTool(),
    buildAgentCompleteTool(),
  ]
}

export function findClassModelToolSpec(toolName: string): ClassModelToolSpec | undefined {
  return listClassModelToolSpecs().find(spec => spec.function.name === toolName)
}

function buildVcmQueryTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.query,
    description: 'Query the ClassModel ClassModel catalog before choosing model, attribute, or method guides.',
    properties: {
      kind: { type: 'string', description: 'Optional exact ClassModel kind.' },
      keyword: { type: 'string', description: 'Optional keyword matched against model/member names and summaries.' },
      includeMembers: { type: 'boolean', description: 'When true, include compact attribute and method summaries.' },
    },
  })
}

function buildVcmModelGuideTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.modelGuide,
    description: 'Render one ClassModel as d.ts-like declaration with native JSDoc.',
    properties: {
      kind: { type: 'string', description: 'ClassModel kind.' },
    },
    required: ['kind'],
  })
}

function buildVcmAttributeGuideTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.attributeGuide,
    description: 'Render one ClassModel attribute declaration with native JSDoc.',
    properties: {
      kind: { type: 'string', description: 'ClassModel kind.' },
      attributeName: { type: 'string', description: 'Attribute name.' },
    },
    required: ['kind', 'attributeName'],
  })
}

function buildVcmActionGuideTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.actionGuide,
    description: 'Render one ClassModel public action declaration with native JSDoc.',
    properties: {
      kind: { type: 'string', description: 'ClassModel kind.' },
      actionName: { type: 'string', description: 'Action name.' },
    },
    required: ['kind', 'actionName'],
  })
}

function buildVcmScriptTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.script,
    description: 'Execute model_script through the injected business script executor after reading relevant guides.',
    properties: {
      script: { type: 'string', description: 'JavaScript body.' },
    },
    required: ['script'],
  })
}

function buildHumanQuestionTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.humanQuestion,
    description: 'Ask the human for missing facts or approval when guessing would be risky.',
    properties: {
      context: { type: 'string', description: 'What the agent is trying to complete.' },
      reason: { type: 'string', description: 'Why user input is needed.' },
      missingFacts: { type: 'array', items: { type: 'string' }, description: 'Missing facts, ordered by importance.' },
      candidateOptions: { type: 'array', items: { type: 'string' }, description: 'Optional choices.' },
    },
    required: ['context', 'reason'],
  })
}

function buildAgentCompleteTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.agentComplete,
    description: 'Complete the current ClassModel production line after all tool work is done.',
    properties: {
      summary: { type: 'string', description: 'Short final user-facing summary.' },
    },
    required: ['summary'],
  })
}

function toolSpec(input: Readonly<{
  name: ClassModelToolName
  description: string
  properties: NonNullable<AiJsonSchemaObject['properties']>
  required?: readonly string[]
}>): ClassModelToolSpec {
  return {
    type: 'function',
    function: {
      name: input.name,
      description: input.description,
      parameters: {
        type: 'object',
        properties: input.properties,
        required: input.required ?? [],
        additionalProperties: false,
      },
    },
  }
}
