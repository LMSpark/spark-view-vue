/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 模块路径值对象                                             │
 * │  Immutable Module Path Value Objects                                          │
 * │                                                                              │
 * │  本文件定义 module-semantic 协议的路径系统，用于定位模块树中的节点。            │
 * │                                                                              │
 * │  路径语法：                                                                   │
 * │    /                                          — 根路径                       │
 * │    /<kind>[<id>]                              — 单段路径                      │
 * │    /<kind1>[<id1>]/<kind2>[<id2>]/...         — 多段路径                      │
 * │                                                                              │
 * │  核心类型：                                                                   │
 * │    · ModulePath         — 不可变路径值对象（segments 列表）                    │
 * │    · ModulePathSegment  — 单段（kind + id）                                  │
 * │    · ModulePathParseError — 路径解析错误（含错误码 + 原始文本 + 位置）        │
 * │                                                                              │
 * │  解析器（splitRawSegments + parseSegment）处理方括号嵌套、空 segment、         │
 * │  缺失前导斜杠等边界情况。                                                      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/* -------------------------------------------------------------------------------
 * 一、错误类型
 * ----------------------------------------------------------------------------- */

export type ModulePathParseErrorCode =
  | 'EMPTY'
  | 'MISSING_LEADING_SLASH'
  | 'INVALID_SEGMENT'
  | 'EMPTY_KIND'
  | 'EMPTY_ID'

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

/* -------------------------------------------------------------------------------
 * 二、路径段（kind + id）
 * ----------------------------------------------------------------------------- */

/**
 * 模块路径段，kind 为模块类型名（如 "Table"、"Form"），id 为实例标识（如 "0"、"main-form"）。
 */
export class ModulePathSegment {
  public constructor(
    public readonly kind: string,
    public readonly id: string,
  ) {}

  /** 校验工厂：kind 和 id 均不可为空 */
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

/* -------------------------------------------------------------------------------
 * 三、模块路径（不可变值对象）
 * -------------------------------------------------------------------------------
 * 创建方式：
 *   · ModulePath.root()          — 根路径 "/"
 *   · ModulePath.of([...])       — 从已有 segments 构造
 *   · ModulePath.parse("/a[1]/b[2]") — 从字符串解析
 *
 * 常用操作：
 *   · parent()    — 返回父路径（根路径的父路径仍为自身）
 *   · append(seg) — 追加一段（校验 kind/id 非空）
 *   · equals()    — 深度比较两个路径
 *   · toString()  — 序列化回 "/kind[id]/kind[id]" 格式
 * ----------------------------------------------------------------------------- */

export class ModulePath {
  public readonly segments: readonly ModulePathSegment[]

  private constructor(segments: readonly ModulePathSegment[]) {
    this.segments = segments
  }

  /** 根路径 "/"（空 segments） */
  public static root(): ModulePath {
    return new ModulePath([])
  }

  /** 从已有 segments 构造（逐段校验） */
  public static of(segments: readonly ModulePathSegment[]): ModulePath {
    return new ModulePath(segments.map((segment, index) => ModulePathSegment.from(segment, '', index)))
  }

  /** 从字符串解析（详见 splitRawSegments + parseSegment） */
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
    let cursor = 1
    for (const part of rawSegments) {
      segments.push(parseSegment(part, raw, cursor))
      cursor += part.length + 1
    }
    return new ModulePath(segments)
  }

  /* ── 查询属性 ──────────────────────────────────────────── */

  public get isRoot(): boolean {
    return this.segments.length === 0
  }

  public get depth(): number {
    return this.segments.length
  }

  /** 末段 segment（根路径返回 undefined） */
  public get tail(): ModulePathSegment | undefined {
    return this.segments.length === 0 ? undefined : this.segments[this.segments.length - 1]
  }

  /* ── 路径操作 ──────────────────────────────────────────── */

  /** 返回父路径（根路径的父路径为自身） */
  public parent(): ModulePath {
    if (this.segments.length === 0) return this
    return new ModulePath(this.segments.slice(0, -1))
  }

  /** 追加一段（kind/id 不可为空） */
  public append(segment: ModulePathSegment): ModulePath {
    if (segment.kind.length === 0) {
      throw new ModulePathParseError('EMPTY_KIND', this.toString(), 'cannot append segment with empty kind')
    }
    if (segment.id.length === 0) {
      throw new ModulePathParseError('EMPTY_ID', this.toString(), 'cannot append segment with empty id')
    }
    return new ModulePath([...this.segments, ModulePathSegment.from(segment, this.toString(), this.segments.length)])
  }

  /** 序列化：/ 或 /kind[id]/kind[id] */
  public toString(): string {
    if (this.segments.length === 0) return '/'
    return this.segments.map((segment) => `/${segment.kind}[${segment.id}]`).join('')
  }

  /** 深度比较两个路径 */
  public equals(other: ModulePath): boolean {
    if (this.segments.length !== other.segments.length) return false
    return this.segments.every((segment, index) => {
      const otherSegment = other.segments[index]
      return segment.kind === otherSegment?.kind && segment.id === otherSegment.id
    })
  }
}

/* -------------------------------------------------------------------------------
 * 四、内部：路径解析器
 * ----------------------------------------------------------------------------- */

/**
 * 解析单段：将 "kind[id]" 拆为 { kind, id }。
 * 方括号必须成对且 id 位于最后一对 [] 之间。
 * 错误码：INVALID_SEGMENT / EMPTY_KIND / EMPTY_ID
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
 * 处理方括号嵌套：仅在外层 bracketDepth===0 时的 '/' 才作为分隔符。
 */
function splitRawSegments(raw: string): string[] {
  const body = raw.slice(1)
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
      // 外层的 '/' 才是段分隔符
      segments.push(body.slice(segmentStart, index))
      segmentStart = index + 1
    }
  }

  if (bracketDepth !== 0) {
    throw new ModulePathParseError('INVALID_SEGMENT', raw, 'unclosed bracket in path')
  }

  segments.push(body.slice(segmentStart))
  return segments
}
