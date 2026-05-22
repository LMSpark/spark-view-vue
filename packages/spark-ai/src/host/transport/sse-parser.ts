/**
 * ═══════════════════════════════════════════════════════════════
 * host/transport/sse-parser.ts — SSE（Server-Sent Events）解析器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】纯函数 SSE 解析器。将原始字节流解析为结构化事件。
 *   不依赖任何框架或平台 API，可在浏览器、Node.js、Worker 中运行。
 *
 * 【SSE 协议要点】
 *   - 事件以空行（\n\n）分隔
 *   - 每个事件包含 field:value 行
 *   - 支持 event 和 data 两个字段
 *   - 以 : 开头的行是注释，忽略
 *
 * 【两个解析模式】
 *   parseAiHostSseBlocks      — 流式解析：从 buffer 中提取完整事件块，返回未完成部分
 *   parseAiHostFinalSseBlock  — 终止解析：处理最后残留的 buffer（流结束后调用）
 *
 * 【消费方】fetch-transport（streamTurn 方法内使用）
 * ═══════════════════════════════════════════════════════════════
 */

/** 解析后的 SSE 事件 */
export type AiHostParsedSseEvent = Readonly<{
  event: string
  data: string
}>

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 单块解析
// ═══════════════════════════════════════════════════════════════

/**
 * 解析单个 SSE 块（两个 \n\n 之间的内容）。
 * 返回 null 表示该块无有效数据（无 data 行）。
 */
function parseAiHostSseBlock(block: string): AiHostParsedSseEvent | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    // 空行和注释行跳过
    if (line === '' || line.startsWith(':')) continue
    const colonIndex = line.indexOf(':')
    const field = colonIndex < 0 ? line : line.slice(0, colonIndex)
    let value = colonIndex < 0 ? '' : line.slice(colonIndex + 1)
    // 按 SSE 规范，冒号后的首空格忽略
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value.trim()
    if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0) return null
  // 多行 data 用 \n 连接
  return { event, data: dataLines.join('\n') }
}

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 流式解析
// ═══════════════════════════════════════════════════════════════

/**
 * 流式解析 SSE 块。
 *
 * 从 buffer 中按 \n\n 分割，最后一个不完整块保留在 rest 中返回。
 * 调用方应将 rest 拼接到下一批数据前面继续解析。
 *
 * 使用方式：
 * ```
 * let buffer = ''
 * for await (const chunk of stream) {
 *   buffer += decoder.decode(chunk, { stream: true })
 *   const { events, rest } = parseAiHostSseBlocks(buffer)
 *   buffer = rest
 *   for (const event of events) handle(event)
 * }
 * ```
 */
export function parseAiHostSseBlocks(buffer: string): { events: readonly AiHostParsedSseEvent[]; rest: string } {
  // 统一换行符
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = normalized.split('\n\n')
  // 最后一段是不完整块（或空字符串），保留在 rest 中
  const rest = parts.pop() ?? ''
  return {
    events: parts.flatMap((block): AiHostParsedSseEvent[] => {
      const parsed = parseAiHostSseBlock(block)
      return parsed === null ? [] : [parsed]
    }),
    rest,
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 终止解析
// ═══════════════════════════════════════════════════════════════

/**
 * 终止解析：处理流结束后 buffer 中残留的最后一段数据。
 * 与 parseAiHostSseBlocks 不同，此函数不再保留 rest，
 * 因为流已结束，没有更多数据会到达。
 */
export function parseAiHostFinalSseBlock(buffer: string): readonly AiHostParsedSseEvent[] {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parsed = normalized.trim() === '' ? null : parseAiHostSseBlock(normalized)
  return parsed === null ? [] : [parsed]
}
