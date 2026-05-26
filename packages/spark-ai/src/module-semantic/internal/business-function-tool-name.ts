/**
 * module-semantic · LLM business function tool names.
 *
 * Business functions are exposed as standard function-calling tools. The public
 * tool name is a reversible, OpenAI-compatible encoding of kind + function name.
 */

const TOOL_NAME_SEPARATOR = '_'
const TOOL_NAME_MAX_LENGTH = 64
const TOOL_NAME_SEGMENT_PATTERN = /^[A-Za-z0-9-]+$/u

export type BusinessFunctionToolRef = Readonly<{
  kindPath: readonly string[]
  functionName: string
  toolName: string
}>

export function createBusinessFunctionToolName(kindPath: readonly string[], functionName: string): string {
  validateFunctionPath(kindPath, functionName)
  const toolName = [...kindPath, functionName].join(TOOL_NAME_SEPARATOR)
  if (toolName.length > TOOL_NAME_MAX_LENGTH) {
    throw new Error(`Business function tool name is too long: ${toolName}`)
  }
  return toolName
}

export function parseBusinessFunctionToolName(toolName: string): BusinessFunctionToolRef | null {
  const parts = toolName.split(TOOL_NAME_SEPARATOR)
  if (parts.length < 2) return null
  const functionName = parts.at(-1)
  if (functionName === undefined) return null
  const kindPath = parts.slice(0, -1)
  if (!isValidFunctionPath(kindPath, functionName)) return null
  const encoded = createBusinessFunctionToolName(kindPath, functionName)
  if (encoded !== toolName) return null
  return {
    kindPath,
    functionName,
    toolName,
  }
}

function validateFunctionPath(kindPath: readonly string[], functionName: string): void {
  if (!isValidFunctionPath(kindPath, functionName)) {
    throw new Error(
      `Invalid business function tool name: ${[...kindPath, functionName].join('_')}`,
    )
  }
}

function isValidFunctionPath(kindPath: readonly string[], functionName: string): boolean {
  return kindPath.length > 0
    && kindPath.every((kind) => isValidToolNameSegment(kind))
    && isValidToolNameSegment(functionName)
}

function isValidToolNameSegment(value: string): boolean {
  return value.length > 0 && TOOL_NAME_SEGMENT_PATTERN.test(value)
}
