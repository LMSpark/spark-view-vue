/**
 * module-semantic · 模块路径值对象
 *
 * 不可变值对象，提供模块树中的节点定位能力。
 * 所有操作方法返回新实例，不修改原对象。
 *
 * 路径语法：
 *   /                              — 根路径（空 segments）
 *   /<kind>[<id>]                  — 单段路径
 *   /<kind1>[<id1>]/<kind2>[<id2>] — 多段路径（从根到目标）
 *
 * 文件结构：错误类型 → 路径段 → 模块路径 → 内部解析器
 */

// ============================================================================
// 一、错误类型
//
// ModulePathParseError 携带 code（机器可读错误码）、raw（原始输入）、
// message（人类可读描述）、position（错误字符偏移，可选）。
// ============================================================================

export type ModulePathParseErrorCode =
  | 'EMPTY'                  // 空字符串
  | 'MISSING_LEADING_SLASH'  // 缺少前导 '/'
  | 'INVALID_SEGMENT'        // segment 语法错误（方括号不成对等）
  | 'EMPTY_KIND'             // segment 中 kind 为空
  | 'EMPTY_ID'               // segment 中 id 为空

export class ModulePathParseError extends Error {
  public constructor(
    public readonly code: ModulePathParseErrorCode,
    public readonly raw: string,
    message: string,
    public readonly position?: number,
  ) {
    super(message)
    this.name = 'ModulePathParseError'
  }
}

// ============================================================================
// 二、路径段 — ModulePathSegment
//
// 模块路径的最小编址单元。kind 为模块类型名（如 "Table"、"Form"），
// id 为实例标识（如 "0"、"main-form"）。两者均不可为空。
// ============================================================================

export class ModulePathSegment {
  public constructor(
    public readonly kind: string,
    public readonly id: string,
  ) {}

  /** 校验工厂：kind 和 id 均不可为空，否则抛出 ModulePathParseError */
  public static from(segment: ModulePathSegment, raw = '', index = 0): ModulePathSegment {
    if (segment.kind.length === 0) {
      throw new ModulePathParseError('EMPTY_KIND', raw, `segment[${String(index)}] has empty kind`)
    }
    if (segment.id.length === 0) {
      throw new ModulePathParseError('EMPTY_ID', raw, `segment[${String(index)}] has empty id`)
    }
    return new ModulePathSegment(segment.kind, segment.id)
  }
}

// ============================================================================
// 三、模块路径 — ModulePath
//
// 不可变值对象，由有序的 ModulePathSegment 列表组成。
//
// 创建方式：root() / of([]) / parse("/a[1]/b[2]")
// 操作方法：parent() / append() / equals() / toString()（均返回新实例）
// 查询属性：isRoot / depth / tail
// ============================================================================

export class ModulePath {
  public readonly segments: readonly ModulePathSegment[]

  private constructor(segments: readonly ModulePathSegment[]) {
    this.segments = segments
  }

  // ── 静态工厂 ──

  /** 根路径 "/"（空 segments） */
  public static root(): ModulePath {
    return new ModulePath([])
  }

  /** 从已有 segments 构造（逐段校验 kind/id 非空） */
  public static of(segments: readonly ModulePathSegment[]): ModulePath {
    return new ModulePath(segments.map((segment, index) => ModulePathSegment.from(segment, '', index)))
  }

  /**
   * 从字符串解析路径。
   * 流程：校验非空 → 校验前导 '/' → 根路径快速返回 → 切分 + 逐段解析。
   */
  public static parse(raw: string): ModulePath {
    if (raw.length === 0) {
      throw new ModulePathParseError('EMPTY', raw, 'path is empty')
    }
    if (!raw.startsWith('/')) {
      throw new ModulePathParseError('MISSING_LEADING_SLASH', raw, 'path must start with "/"', 0)
    }
    if (raw === '/') {
      return ModulePath.root()
    }

    const rawSegments = splitRawSegments(raw)
    const segments: ModulePathSegment[] = []
    let cursor = 1 // 跳过前导 '/'，从位置 1 开始计数
    for (const part of rawSegments) {
      segments.push(parseSegment(part, raw, cursor))
      cursor += part.length + 1 // +1 为分隔符 '/'
    }
    return new ModulePath(segments)
  }

  // ── 查询属性 ──

  /** 是否为根路径（segments 为空） */
  public get isRoot(): boolean {
    return this.segments.length === 0
  }

  /** 路径深度（segments 数量） */
  public get depth(): number {
    return this.segments.length
  }

  /** 末段 segment（根路径返回 undefined） */
  public get tail(): ModulePathSegment | undefined {
    return this.segments.length === 0 ? undefined : this.segments[this.segments.length - 1]
  }

  // ── 路径操作（均返回新实例）──

  /** 返回父路径（去掉末段）。根路径的父路径为自身。 */
  public parent(): ModulePath {
    if (this.segments.length === 0) return this
    return new ModulePath(this.segments.slice(0, -1))
  }

  /** 追加一段到末尾。kind/id 不可为空，否则抛出 ModulePathParseError。 */
  public append(segment: ModulePathSegment): ModulePath {
    if (segment.kind.length === 0) {
      throw new ModulePathParseError('EMPTY_KIND', this.toString(), 'cannot append segment with empty kind')
    }
    if (segment.id.length === 0) {
      throw new ModulePathParseError('EMPTY_ID', this.toString(), 'cannot append segment with empty id')
    }
    return new ModulePath([...this.segments, ModulePathSegment.from(segment, this.toString(), this.segments.length)])
  }

  // ── 序列化与比较 ──

  /** 序列化为字符串：根路径返回 "/"，否则为 "/kind[id]/kind[id]" */
  public toString(): string {
    if (this.segments.length === 0) return '/'
    return this.segments.map((segment) => `/${segment.kind}[${segment.id}]`).join('')
  }

  /** 深度比较两个路径是否相等（逐段比较 kind 和 id） */
  public equals(other: ModulePath): boolean {
    if (this.segments.length !== other.segments.length) return false
    return this.segments.every((segment, index) => {
      const otherSegment = other.segments[index]
      return segment.kind === otherSegment?.kind && segment.id === otherSegment.id
    })
  }
}

// ============================================================================
// 四、内部解析器
//
// 以下函数仅被 ModulePath.parse() 调用，负责将原始字符串拆分为结构化数据。
// ============================================================================

/**
 * 解析单段：将 "kind[id]" 拆为 { kind, id }。
 * 方括号必须成对且 id 位于最后一对 [] 之间。
 */
function parseSegment(part: string, raw: string, position: number): ModulePathSegment {
  const openIndex = part.indexOf('[')
  const closeIndex = part.lastIndexOf(']')
  if (openIndex <= 0 || closeIndex !== part.length - 1 || closeIndex <= openIndex) {
    throw new ModulePathParseError(
      'INVALID_SEGMENT',
      raw,
      `invalid segment syntax "${part}": expected "<kind>[<id>]"`,
      position,
    )
  }

  const kind = part.slice(0, openIndex)
  const id = part.slice(openIndex + 1, closeIndex)
  if (kind.length === 0) {
    throw new ModulePathParseError('EMPTY_KIND', raw, `empty kind in segment "${part}"`, position)
  }
  if (id.length === 0) {
    throw new ModulePathParseError('EMPTY_ID', raw, `empty id in segment "${part}"`, position)
  }
  return new ModulePathSegment(kind, id)
}

/**
 * 分割原始字符串为 segment 部分（去除前导 '/' 后按 '/' 切分）。
 * 关键：仅在外层 bracketDepth===0 时的 '/' 才作为分隔符，正确处理方括号嵌套。
 */
function splitRawSegments(raw: string): string[] {
  const body = raw.slice(1) // 去除前导 '/'
  const segments: string[] = []
  let bracketDepth = 0
  let segmentStart = 0

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === '[') {
      bracketDepth += 1
    } else if (char === ']') {
      bracketDepth -= 1
      if (bracketDepth < 0) {
        throw new ModulePathParseError('INVALID_SEGMENT', raw, 'unexpected closing bracket in path', index + 1)
      }
    } else if (char === '/' && bracketDepth === 0) {
      // 仅当不在方括号内时，'/' 才是段分隔符
      segments.push(body.slice(segmentStart, index))
      segmentStart = index + 1
    }
  }

  if (bracketDepth !== 0) {
    throw new ModulePathParseError('INVALID_SEGMENT', raw, 'unclosed bracket in path')
  }

  // 最后一段（末尾没有 '/' 分隔符）
  segments.push(body.slice(segmentStart))
  return segments
}
