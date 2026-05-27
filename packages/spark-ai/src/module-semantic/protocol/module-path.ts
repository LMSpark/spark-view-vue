/**
 * module-semantic · 模块路径值对象
 *
 * 协议层级：第 2 层（无协议内依赖，独立的值对象层）
 * 核心职责：提供模块树中的节点定位能力，是不可变值对象。
 * 上游依赖：无（仅依赖 TypeScript 标准库）
 * 下游消费：module-context（ModulePathContext 引用 ModulePathSegment）、module-kind、
 *          module-request、以及 Navigator / Runtime 等消费方
 *
 * 路径语法：
 *   /                              — 根路径（空 segments）
 *   /<kind>[<id>]                  — 单段路径（如 /Table[0]）
 *   /<kind1>[<id1>]/<kind2>[<id2>] — 多段路径（从根到目标节点，如 /Page[main]/Table[0]）
 *
 * 设计思路：
 *   ModulePath 是不可变值对象，所有操作方法（parent / append）返回新实例。
 *   路径解析采用 fail-fast 策略，非法输入直接抛出 ModulePathParseError。
 *
 * 文件结构（按解析流程：错误定义 → 路径段 → 完整路径 → 内部解析器）：
 *   一、错误类型        — ModulePathParseErrorCode + ModulePathParseError
 *   二、路径段          — ModulePathSegment（最小编址单元）
 *   三、模块路径        — ModulePath（不可变值对象，含静态工厂 + 查询 + 操作方法）
 *   四、内部解析器      — parseSegment / splitRawSegments（仅 parse() 调用）
 */

// ============================================================================
// 一、错误类型
//
// ModulePathParseError 携带完整诊断信息，方便调用方精确处理：
//   code     — 机器可读错误码（EMPTY / MISSING_LEADING_SLASH / INVALID_SEGMENT 等）
//   raw      — 原始输入字符串（保留现场，便于日志和调试）
//   message  — 人类可读描述
//   position — 错误字符偏移（可选，用于 IDE 高亮错误位置）
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
// 模块路径的最小编址单元，由 kind（模块类型名）和 id（实例标识）组成。
// 例：/Table[0] 中 kind="Table", id="0"；/Form[main-form] 中 kind="Form", id="main-form"
//
// 校验规则：
//   kind 不可为空字符串（空 kind 无法定位 ModuleKind）
//   id 不可为空字符串（空 id 无法定位具体实例）
//   ModulePathSegment.from 是带校验的工厂，在校验场景使用
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
// 不可变值对象，由有序的 ModulePathSegment 列表组成，从根到目标节点。
//
// 创建方式（三种静态工厂）：
//   ModulePath.root()              → 根路径 "/"
//   ModulePath.of([seg1, seg2])    → 从已有 segments 构造（逐段校验）
//   ModulePath.parse("/a[1]/b[2]") → 从字符串解析（完整语法校验）
//
// 查询属性：
//   isRoot — 是否为根路径（segments 长度为 0）
//   depth  — 路径深度（segments 数量）
//   tail   — 末段 segment（根路径返回 undefined）
//
// 路径操作（均返回新实例，不修改原对象）：
//   parent() — 返回父路径（去掉末段；根路径为自身）
//   append() — 追加一段到末尾
//   equals() — 深度比较两个路径
//   toString() — 序列化为 "/kind[id]/kind[id]" 格式
// ============================================================================

export class ModulePath {
  public readonly segments: readonly ModulePathSegment[]

  private constructor(segments: readonly ModulePathSegment[]) {
    this.segments = segments
  }

  // ── 静态工厂 ──

  /** 根路径 "/"（空 segments）。所有路径解析的起点。 */
  public static root(): ModulePath {
    return new ModulePath([])
  }

  /** 从已有 segments 构造（逐段校验 kind/id 非空） */
  public static of(segments: readonly ModulePathSegment[]): ModulePath {
    return new ModulePath(segments.map((segment, index) => ModulePathSegment.from(segment, '', index)))
  }

  /**
   * 从字符串解析路径。解析流程：
   *   1. 校验非空 → 2. 校验前导 '/' → 3. 根路径快速返回
   *   → 4. 按 '/' 切分原始段 → 5. 逐段解析 kind[id]
   * 任意步骤失败均抛出 ModulePathParseError。
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

  /** 路径深度（segments 数量）。根路径 depth=0，/A[1]/B[2] depth=2 */
  public get depth(): number {
    return this.segments.length
  }

  /** 末段 segment（根路径返回 undefined）。用于定位当前节点。 */
  public get tail(): ModulePathSegment | undefined {
    return this.segments.length === 0 ? undefined : this.segments[this.segments.length - 1]
  }

  // ── 路径操作（均返回新实例，保持不可变性）──

  /** 返回父路径（去掉末段）。根路径的父路径为自身（幂等）。 */
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

  /** 序列化为字符串：根路径 → "/"，否则 → "/kind[id]/kind[id]" */
  public toString(): string {
    if (this.segments.length === 0) return '/'
    return this.segments.map((segment) => `/${segment.kind}[${segment.id}]`).join('')
  }

  /** 深度比较两个路径是否相等（逐段比较 kind 和 id）。顺序敏感。 */
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
// 不对外暴露，保持 ModulePath 的封装性。
// ============================================================================

/**
 * 解析单段：将 "kind[id]" 拆为 { kind, id }。
 * 语法约束：方括号必须成对，且 id 位于最后一对 [] 之间。
 * 例："Table[0]" → { kind: "Table", id: "0" }
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
 *
 * 核心算法：括号感知分割
 *   遍历 body 中每个字符，维护 bracketDepth 计数器：
 *     '[' → depth+1（进入方括号区域）
 *     ']' → depth-1（退出方括号区域，depth<0 表示多余的右括号，抛错）
 *     '/' → 仅当 depth===0 时才是段分隔符（在方括号内的 '/' 属于 id 的一部分）
 *   遍历结束后 depth!==0 表示方括号未闭合，抛错。
 *
 * 例："Table[0]/Column[a/b]" → ["Table[0]", "Column[a/b]"]
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
