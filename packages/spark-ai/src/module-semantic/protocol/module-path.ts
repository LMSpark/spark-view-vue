/**
 * Module semantic immutable path value objects.
 */

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
    public readonly position?: number | undefined,
  ) {
    super(message)
    this.name = 'ModulePathParseError'
  }
}

export class ModulePathSegment {
  public constructor(
    public readonly kind: string,
    public readonly id: string,
  ) {}

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

export class ModulePath {
  public readonly segments: readonly ModulePathSegment[]

  private constructor(segments: readonly ModulePathSegment[]) {
    this.segments = segments
  }

  public static root(): ModulePath {
    return new ModulePath([])
  }

  public static of(segments: readonly ModulePathSegment[]): ModulePath {
    return new ModulePath(segments.map((segment, index) => ModulePathSegment.from(segment, '', index)))
  }

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

  public get isRoot(): boolean {
    return this.segments.length === 0
  }

  public get depth(): number {
    return this.segments.length
  }

  public get tail(): ModulePathSegment | undefined {
    return this.segments.length === 0 ? undefined : this.segments[this.segments.length - 1]
  }

  public parent(): ModulePath {
    if (this.segments.length === 0) return this
    return new ModulePath(this.segments.slice(0, -1))
  }

  public append(segment: ModulePathSegment): ModulePath {
    if (segment.kind.length === 0) {
      throw new ModulePathParseError('EMPTY_KIND', this.toString(), 'cannot append segment with empty kind')
    }
    if (segment.id.length === 0) {
      throw new ModulePathParseError('EMPTY_ID', this.toString(), 'cannot append segment with empty id')
    }
    return new ModulePath([...this.segments, ModulePathSegment.from(segment, this.toString(), this.segments.length)])
  }

  public toString(): string {
    if (this.segments.length === 0) return '/'
    return this.segments.map((segment) => `/${segment.kind}[${segment.id}]`).join('')
  }

  public equals(other: ModulePath): boolean {
    if (this.segments.length !== other.segments.length) return false
    return this.segments.every((segment, index) => {
      const otherSegment = other.segments[index]
      return segment.kind === otherSegment?.kind && segment.id === otherSegment.id
    })
  }
}

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
