import type { PageFiles, StreamCallbacks } from '@spark-view/spark-ai'

export interface AiLoopLike {
  iterateStream: (
    pageId: string,
    prompt: string,
    callbacks: StreamCallbacks,
    currentFiles?: PageFiles,
  ) => Promise<{
    files?: PageFiles
    explanation?: string
  }>
}

export interface AiFileWritebackResult {
  content: string | null
  source: 'files' | 'json-fallback' | 'fenced-fallback' | 'explanation' | 'delta' | 'none'
  fullText: string
  files: PageFiles
}

export interface AiFilesWritebackResult {
  files: Partial<Record<string, string>>
  fullText: string
  explanation: string
}

function detectFenceLanguage(fileName: string): string | null {
  const lowered = fileName.toLowerCase()
  if (lowered.endsWith('.json')) return 'json'
  if (lowered.endsWith('.js')) return 'javascript'
  if (lowered.endsWith('.ts')) return 'typescript'
  if (lowered.endsWith('.css')) return 'css'
  if (lowered.endsWith('.vue')) return 'vue'
  return null
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1]) as unknown
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // ignore
    }
  }

  return null
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractFencedCode(text: string, language: string | null): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (language) {
    const full = escapeForRegExp(language)
    const short = escapeForRegExp(language.slice(0, 2))
    const langFence = new RegExp(`\`\`\`(?:${full}|${short})\\s*([\\s\\S]*?)\\s*\`\`\``, 'i')
    const langMatch = trimmed.match(langFence)
    if (langMatch?.[1]) return langMatch[1].trim()
  }

  const genericFence = trimmed.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```/)
  if (genericFence?.[1]) return genericFence[1].trim()

  return null
}

export async function runAiFileWriteback(params: {
  loop: AiLoopLike
  pageId: string
  prompt: string
  targetFile: string
  contextFiles?: PageFiles
  callbacks?: Partial<StreamCallbacks>
}): Promise<AiFileWritebackResult> {
  let fullText = ''

  const response = await params.loop.iterateStream(
    params.pageId,
    params.prompt,
    {
      onDelta(text) {
        fullText += text
        params.callbacks?.onDelta?.(text)
      },
      onReasoning(text) {
        params.callbacks?.onReasoning?.(text)
      },
      onPhase(phase, status, message) {
        params.callbacks?.onPhase?.(phase, status, message)
      },
      onError(error) {
        params.callbacks?.onError?.(error)
      },
    },
    params.contextFiles,
  )

  const filesMap = response.files as Record<string, string | undefined> | undefined
  const fromFiles = filesMap?.[params.targetFile]
  if (typeof fromFiles === 'string' && fromFiles.trim().length > 0) {
    return {
      content: fromFiles,
      source: 'files',
      fullText,
      files: response.files ?? {},
    }
  }

  const fallbackText = `${fullText}\n${response.explanation ?? ''}`.trim()
  if (params.targetFile.toLowerCase().endsWith('.json')) {
    const json = extractJsonObject(fallbackText)
    if (json) {
      return {
        content: JSON.stringify(json, null, 2),
        source: 'json-fallback',
        fullText,
        files: response.files ?? {},
      }
    }
  }

  const fenced = extractFencedCode(fallbackText, detectFenceLanguage(params.targetFile))
  if (fenced) {
    return {
      content: fenced,
      source: 'fenced-fallback',
      fullText,
      files: response.files ?? {},
    }
  }

  if (response.explanation && response.explanation.trim().length > 0) {
    return {
      content: response.explanation,
      source: 'explanation',
      fullText,
      files: response.files ?? {},
    }
  }

  if (fullText.trim().length > 0) {
    return {
      content: fullText,
      source: 'delta',
      fullText,
      files: response.files ?? {},
    }
  }

  return {
    content: null,
    source: 'none',
    fullText,
    files: response.files ?? {},
  }
}

export async function runAiFilesWriteback(params: {
  loop: AiLoopLike
  pageId: string
  prompt: string
  targetFiles: string[]
  contextFiles?: PageFiles
  callbacks?: Partial<StreamCallbacks>
}): Promise<AiFilesWritebackResult> {
  let fullText = ''
  let explanation = ''

  const response = await params.loop.iterateStream(
    params.pageId,
    params.prompt,
    {
      onDelta(text) {
        fullText += text
        params.callbacks?.onDelta?.(text)
      },
      onReasoning(text) {
        params.callbacks?.onReasoning?.(text)
      },
      onPhase(phase, status, message) {
        params.callbacks?.onPhase?.(phase, status, message)
      },
      onError(error) {
        params.callbacks?.onError?.(error)
      },
    },
    params.contextFiles,
  )

  explanation = response.explanation ?? ''
  const filesMap = (response.files ?? {}) as Record<string, string | undefined>
  const files: Partial<Record<string, string>> = {}
  for (const file of params.targetFiles) {
    const content = filesMap[file]
    if (typeof content === 'string' && content.trim().length > 0) {
      files[file] = content
    }
  }

  return {
    files,
    fullText,
    explanation,
  }
}
