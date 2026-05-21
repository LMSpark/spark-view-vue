/**
 * @packageDocumentation
 *
 * 模块语义协议 — 路径值对象。
 *
 * 严格语法:`/<kind>[<id>]/<kind>[<id>]/...`,只允许精确 id。
 * 查询不进入路径 —— LLM 想找 id 必须先调 find / list 工具。
 *
 * 路径只是"如何到达某 instance 的一次指令",不是 instance 自身属性。
 * 含环路径合法(`/teacher[t1]/class[c2]/teacher[t1]`),协议照常逐段路由。
 *
 * ModulePath 是不可变值对象,所有操作返回新实例。
 */

/**
 * 路径段。代表一次"在某个 kind 下选某个 id"的步进。
 */
export interface ModulePathSegment {
  readonly kind: string
  readonly id: string
}

/**
 * 路径解析错误码。
 */
export type ModulePathParseErrorCode =
  | 'EMPTY'
  | 'MISSING_LEADING_SLASH'
  | 'INVALID_SEGMENT'
  | 'EMPTY_KIND'
  | 'EMPTY_ID'

/**
 * 路径解析错误。
 *
 * 协议在 LLM 传入非法路径时抛此错误,由调用方包装成 OperationResult。
 */
export class ModulePathParseError extends Error {
  public readonly code: ModulePathParseErrorCode

  public readonly raw: string

  public readonly position?: number | undefined

  constructor(code: ModulePathParseErrorCode, raw: string, message: string, position?: number) {
    super(message)
    this.name = 'ModulePathParseError'
    this.code = code
    this.raw = raw
    if (position !== undefined) {
      this.position = position
    }
  }
}

/**
 * 模块路径。
 *
 * 不可变值对象。
 *
 * 构造方式:
 * - ModulePath.parse('/school[jianguo]/grade[g3]')  显式字符串解析
 * - ModulePath.of([{kind:'school', id:'jianguo'}, ...])  按段构造
 * - ModulePath.root()  根路径(无段)
 *
 * 路径**永远以 `/` 开头**。根路径序列化为 `/`。
 */
export class ModulePath {
  /** 段序列(只读副本) */
  public readonly segments: readonly ModulePathSegment[]

  private constructor(segments: readonly ModulePathSegment[]) {
    this.segments = segments
  }

  /**
   * 构造根路径(无段)。
   */
  public static root(): ModulePath {
    return new ModulePath([])
  }

  /**
   * 按段构造路径。所有段必须合法(非空 kind / 非空 id)。
   */
  public static of(segments: readonly ModulePathSegment[]): ModulePath {
    segments.forEach((seg, index) => {
      if (seg.kind.length === 0) {
        throw new ModulePathParseError('EMPTY_KIND', '', `segment[${String(index)}] has empty kind`)
      }
      if (seg.id.length === 0) {
        throw new ModulePathParseError('EMPTY_ID', '', `segment[${String(index)}] has empty id`)
      }
    })
    return new ModulePath(segments.map((seg) => ({ kind: seg.kind, id: seg.id })))
  }

  /**
   * 解析字符串路径。
   *
   * 接受形如 `/<kind>[<id>]/<kind>[<id>]/...` 的语法,根路径 `/` 也合法。
   *
   * 失败抛 ModulePathParseError。
   */
  public static parse(raw: string): ModulePath {
    if (raw.length === 0) {
      throw new ModulePathParseError('EMPTY', raw, 'path is empty')
    }
    if (!raw.startsWith('/')) {
      throw new ModulePathParseError(
        'MISSING_LEADING_SLASH',
        raw,
        'path must start with "/"',
        0,
      )
    }
    if (raw === '/') {
      return ModulePath.root()
    }
    const rawSegments = ModulePath.splitRawSegments(raw)
    const segments: ModulePathSegment[] = []
    let cursor = 1
    for (const part of rawSegments) {
      const seg = ModulePath.parseSegment(part, raw, cursor)
      segments.push(seg)
      cursor += part.length + 1
    }
    return new ModulePath(segments)
  }

  /**
   * 是否根路径。
   */
  public get isRoot(): boolean {
    return this.segments.length === 0
  }

  /**
   * 段数。
   */
  public get depth(): number {
    return this.segments.length
  }

  /**
   * 末段(可能为 undefined,如果是根路径)。
   */
  public get tail(): ModulePathSegment | undefined {
    return this.segments.length === 0 ? undefined : this.segments[this.segments.length - 1]
  }

  /**
   * 父路径(去掉末段)。根路径返回自身。
   */
  public parent(): ModulePath {
    if (this.segments.length === 0) {
      return this
    }
    return new ModulePath(this.segments.slice(0, -1))
  }

  /**
   * 追加一段返回新路径。
   */
  public append(segment: ModulePathSegment): ModulePath {
    if (segment.kind.length === 0) {
      throw new ModulePathParseError('EMPTY_KIND', this.toString(), 'cannot append segment with empty kind')
    }
    if (segment.id.length === 0) {
      throw new ModulePathParseError('EMPTY_ID', this.toString(), 'cannot append segment with empty id')
    }
    return new ModulePath([...this.segments, { kind: segment.kind, id: segment.id }])
  }

  /**
   * 序列化为字符串路径。
   */
  public toString(): string {
    if (this.segments.length === 0) {
      return '/'
    }
    return this.segments.map((seg) => `/${seg.kind}[${seg.id}]`).join('')
  }

  /**
   * 判断两路径段序列是否一致。
   */
  public equals(other: ModulePath): boolean {
    if (this.segments.length !== other.segments.length) {
      return false
    }
    return this.segments.every((seg, index) => {
      const otherSeg = other.segments[index]
      return seg.kind === otherSeg?.kind && seg.id === otherSeg.id
    })
  }

  /**
   * 解析单个段 `<kind>[<id>]`。
   */
  private static parseSegment(part: string, raw: string, position: number): ModulePathSegment {
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
    return { kind, id }
  }

  private static splitRawSegments(raw: string): string[] {
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
}
