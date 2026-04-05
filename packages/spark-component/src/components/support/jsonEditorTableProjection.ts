import type { Content } from 'vanilla-jsoneditor'

export type JSONPath = ReadonlyArray<string | number>

export interface JSONEditorSelectionLike {
  type: string
  path?: JSONPath
  focusPath?: JSONPath
}

type JsonObject = Record<string, unknown>

function isStructuredSelection(selection: JSONEditorSelectionLike | undefined): selection is JSONEditorSelectionLike {
  return Boolean(selection && selection.type !== 'text' && (Array.isArray(selection.path) || Array.isArray(selection.focusPath)))
}

function getSelectionFocusPath(selection: JSONEditorSelectionLike): JSONPath {
  if (Array.isArray(selection.focusPath)) {
    return selection.focusPath as JSONPath
  }

  return Array.isArray(selection.path) ? selection.path as JSONPath : []
}

export interface TableProjectionState {
  projectedContent: Content
  projectedPath: JSONPath | null
  projected: boolean
}

export function getJsonValueAtPath(json: unknown, path: JSONPath): unknown {
  let current: unknown = json

  for (const segment of path) {
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || segment < 0 || segment >= current.length) {
        return undefined
      }
      current = current[segment]
      continue
    }

if (current !== null && current !== undefined && typeof current === 'object') {
      current = (current as JsonObject)[String(segment)]
      continue
    }

    return undefined
  }

  return current
}

export function findSelectedArrayPath(json: unknown, selection: JSONEditorSelectionLike | undefined): JSONPath | null {
  if (Array.isArray(json)) {
    return []
  }

  if (!isStructuredSelection(selection)) {
    return null
  }

  const focusPath = getSelectionFocusPath(selection)
  for (let length = focusPath.length; length >= 0; length -= 1) {
    const candidatePath = focusPath.slice(0, length)
    if (Array.isArray(getJsonValueAtPath(json, candidatePath))) {
      return candidatePath
    }
  }

  return null
}

export function createTableProjectionState(
  content: Content,
  selectedPath: JSONPath | null,
): TableProjectionState {
  if (!('json' in content)) {
    return {
      projectedContent: content,
      projectedPath: null,
      projected: false,
    }
  }

  if (Array.isArray(content.json)) {
    return {
      projectedContent: content,
      projectedPath: [],
      projected: false,
    }
  }

  if (!selectedPath) {
    return {
      projectedContent: content,
      projectedPath: null,
      projected: false,
    }
  }

  const selectedValue = getJsonValueAtPath(content.json, selectedPath)
  if (!Array.isArray(selectedValue)) {
    return {
      projectedContent: content,
      projectedPath: null,
      projected: false,
    }
  }

  return {
    projectedContent: { json: selectedValue },
    projectedPath: selectedPath,
    projected: selectedPath.length > 0,
  }
}

export function replaceJsonValueAtPath(json: unknown, path: JSONPath, replacement: unknown): unknown {
  if (path.length === 0) {
    return replacement
  }

  const [head, ...tail] = path

  if (Array.isArray(json)) {
    if (typeof head !== 'number' || head < 0 || head >= json.length) {
      return json
    }

    const arr = json as unknown[]
    const clone = Array.from(arr)
    clone[head] = replaceJsonValueAtPath(arr[head], tail, replacement)
    return clone
  }

  if (json !== null && json !== undefined && typeof json === 'object') {
    const key = String(head)
    return {
      ...(json as JsonObject),
      [key]: replaceJsonValueAtPath((json as JsonObject)[key], tail, replacement),
    }
  }

  return json
}

export function applyTableProjectionChange(
  content: Content,
  projectedPath: JSONPath | null,
  updatedContent: Content,
): Content {
  if (!('json' in content) || !('json' in updatedContent) || !projectedPath) {
    return updatedContent
  }

  return {
    json: replaceJsonValueAtPath(content.json, projectedPath, updatedContent.json),
  }
}

export function formatJsonPath(path: JSONPath | null): string {
  if (!path || path.length === 0) {
    return '$'
  }

  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') {
      return `${result}[${segment}]`
    }

    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)
      ? `${result}.${segment}`
      : `${result}[${JSON.stringify(segment)}]`
  }, '$')
}