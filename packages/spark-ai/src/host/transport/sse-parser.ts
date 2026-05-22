/**
 * Server-Sent Events block parser.
 */

export type AiHostParsedSseEvent = Readonly<{
  event: string
  data: string
}>

function parseAiHostSseBlock(block: string): AiHostParsedSseEvent | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue
    const colonIndex = line.indexOf(':')
    const field = colonIndex < 0 ? line : line.slice(0, colonIndex)
    let value = colonIndex < 0 ? '' : line.slice(colonIndex + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value.trim()
    if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

export function parseAiHostSseBlocks(buffer: string): { events: readonly AiHostParsedSseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  return {
    events: parts.flatMap((block): AiHostParsedSseEvent[] => {
      const parsed = parseAiHostSseBlock(block)
      return parsed === null ? [] : [parsed]
    }),
    rest,
  }
}

export function parseAiHostFinalSseBlock(buffer: string): readonly AiHostParsedSseEvent[] {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parsed = normalized.trim() === '' ? null : parseAiHostSseBlock(normalized)
  return parsed === null ? [] : [parsed]
}
