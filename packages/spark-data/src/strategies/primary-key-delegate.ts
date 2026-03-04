/**
 * PrimaryKeyDelegate — 主键管理委托
 *
 * 封装 DataView 中所有主键相关的状态和逻辑：
 * - 单列主键 / 多列合成主键（_pk）
 * - 主键值强转（_coercePkValue）
 * - 主键生成器（PrimaryKeyGenerator）
 *
 * DataView 通过构造函数注入三个轻量回调持有对 DataView 资源的引用，
 * 避免循环依赖和双向耦合。
 */

import type { IDataRow, DataColumn } from '../types'
import type { PrimaryKeyGenerator, PrimaryKeyGeneratorConfig } from '../core/primary-key-generator'
import { createPrimaryKeyGenerator } from '../core/primary-key-generator'
import { isSameRow } from '../core/utils'

export class PrimaryKeyDelegate {
  /** 显式覆盖的主键字段名（undefined = 从 DataTable 列定义推导） */
  private _primaryKeyOverride?: string | undefined

  /**
   * 自动合成的 _pk 计算列所用字段（幺等守卫）。
   * 存了就不重复注册；字段变化时自动失效重生。
   */
  private _syntheticPkFields: string[] | undefined

  /** 主键生成器（可选，用于自动生成新记录的主键） */
  private _primaryKeyGenerator?: PrimaryKeyGenerator | undefined

  /**
   * @param _getColumns        获取当前 DataTable 的列定义（用于推导主键）
   * @param _getColumnMap      获取列名→列定义 Map（用于 _coercePkValue O(1) 查找）
   * @param _getRows           获取当前行数组（用于主键生成器 / 补计算触发点）
   * @param _registerComputed  向 ComputedColumnDelegate 注册计算列（用于合成 _pk）
   */
  constructor(
    private readonly _getColumns: () => DataColumn[],
    private readonly _getColumnMap: () => Map<string, DataColumn> | undefined,
    private readonly _getRows: () => IDataRow[],
    private readonly _registerComputed: (name: string, fn: (row: IDataRow) => unknown) => void,
  ) {}

  // ─────────────────────────────────────────────
  // 合成主键
  // ─────────────────────────────────────────────

  /**
   * 多主键时自动合成 _pk 计算列（幺等）。
   *
   * 将各主键字段值用 '+' 拼接为单一字符串：
   * `{ orderId: 1, lineNo: 'A' }` → `'1+A'`
   *
   * 幺等条件：字段列表与上次相同时直接返回，不重新注册。
   * 补计算由调用方负责（DataView 的 dataTable setter）。
   */
  ensureSyntheticPk(fields: string[]): void {
    if (this._syntheticPkFields?.join('\x01') === fields.join('\x01')) return
    this._syntheticPkFields = fields
    this._registerComputed('_pk', (row) =>
      fields.map(f => String(row[f] ?? '')).join('+'),
    )
  }

  /** 当前合成主键字段列表（用于 DataView 在 ensureSyntheticPk 后补计算） */
  get syntheticPkFields(): string[] | undefined {
    return this._syntheticPkFields
  }

  // ─────────────────────────────────────────────
  // 主键字段名
  // ─────────────────────────────────────────────

  /** 显式覆盖值（供外部读取，用于 dataTable setter 中的守卫判断） */
  get primaryKeyOverride(): string | undefined {
    return this._primaryKeyOverride
  }

  /**
   * 主键字段名（支持单主键字符串或多主键数组）。
   *
   * 解析优先级：
   * 1. 显式覆盖值（通过 `primaryKey = 'xxx'` 设置）
   * 2. DataTable 列定义中 `isPrimaryKey: true` 的列名
   * 3. 回退默认值 `'id'`
   *
   * 注意：此 getter 可能触发 ensureSyntheticPk（副作用：注册 _pk 计算列），
   * 但不会主动触发行补计算，补计算由 DataView 的 dataTable setter 完成。
   */
  get primaryKey(): string {
    if (this._primaryKeyOverride !== undefined) return this._primaryKeyOverride

    const cols = this._getColumns()
    if (cols.length > 0) {
      const pkCols = cols.filter(c => c.isPrimaryKey)
      if (pkCols.length === 1) {
        const col = pkCols[0]
        if (col) return col.name
      }
      if (pkCols.length > 1) {
        // 自动合成 _pk：注册计算列，返回合成键名
        this.ensureSyntheticPk(pkCols.map(c => c.name))
        return '_pk'
      }
    }
    return 'id'
  }

  set primaryKey(value: string) {
    this._primaryKeyOverride = value
  }

  /**
   * 清除显式覆盖，恢复从 DataTable 列定义自动推导主键。
   *
   * @example
   * view.primaryKey = 'uuid'  // 显式覆盖
   * view.resetPrimaryKey()    // 恢复列推导
   */
  resetPrimaryKey(): void {
    this._primaryKeyOverride = undefined
    // 清除合成主键幺等守卫，使其下次访问 primaryKey 时重新计算
    this._syntheticPkFields = undefined
  }

  /**
   * 实际生效的主键字段名列表（不含合成列 `_pk`）。
   *
   * - 多列自动合成时返回原始字段列表（`_syntheticPkFields`）
   * - 否则返回 `[primaryKey]`
   *
   * @internal 供委托（`LocalMutationDelegate` 等）校验/遍历真实字段
   */
  get effectivePkFields(): string[] {
    return this._syntheticPkFields ?? [this.primaryKey]
  }

  // ─────────────────────────────────────────────
  // 主键值解析
  // ─────────────────────────────────────────────

  /**
   * 获取行的主键值（标量）。
   *
   * `primaryKey` 始终为单一字符串字段名（多列 PK 自动合成为 `_pk`），
   * 因此返回值始终为 `string | number`。
   *
   * 所有内部 Map/Set/`===` 比较均使用此方法。
   */
  getPkKey(row: IDataRow): string | number | undefined {
    const value = row[this.primaryKey]
    if (value === undefined || value === null) return undefined
    return this._coercePkValue(this.primaryKey, value)
  }

  /**
   * 从行数据构建服务端 PK payload（用于 CRUD HTTP 请求）。
   *
   * 对于自动合成 _pk 的多列主键，返回原始字段的 Record：
   *   `{ orderId: 1, productId: 10 }`
   * 对于单列主键，返回单字段 Record：
   *   `{ id: 42 }`
   *
   * @internal 供 saveChanges / CrudDelegate 等构建服务端请求使用
   */
  buildServerPk(row: IDataRow): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const f of this.effectivePkFields) result[f] = row[f]
    return result
  }

  /**
   * 检查两行是否有相同的主键
   */
  isSamePrimaryKey(row1: IDataRow, row2: IDataRow): boolean {
    return isSameRow(row1, row2, this.primaryKey)
  }

  // ─────────────────────────────────────────────
  // 主键值类型强转
  // ─────────────────────────────────────────────

  /** 数字类列类型集合——主键值需要强转为 number */
  private static readonly _numericTypes = new Set(['number', 'int', 'integer', 'decimal', 'float', 'double'])

  /**
   * 根据 DataTable 列定义的 type 强转主键值为 Map/Set 可用的 string | number。
   *
   * 策略（按列 type 分支）：
   * - **数字类** (`number`/`int`/`integer`/`decimal`/`float`/`double`)
   *   → `Number(value)`（NaN → undefined）
   * - **布尔类** (`boolean`/`bool`)
   *   → `1` / `0`（可作为 number key，避免 `'true'`/`'false'` 的国际化差异）
   * - **日期类** (`date`/`datetime`/`time`)
   *   → ISO 字符串（Date 对象走 `toISOString()`；字符串保持原样）
   * - **字符串/枚举/其他**
   *   → `String(value)`（兜底：任何值都能转成唯一字符串 key）
   *
   * 无列定义时：
   * - 已经是 string / number → 保持原样
   * - 其他 → `String(value)`
   */
  private _coercePkValue(field: string, value: unknown): string | number | undefined {
    // null / undefined 已在调用层排除
    if (value === null || value === undefined) return undefined

    const col = this._getColumnMap()?.get(field)

    if (col !== undefined) {
      if (PrimaryKeyDelegate._numericTypes.has(col.type)) {
        const n = Number(value)
        return isNaN(n) ? undefined : n
      }
      if (col.type === 'boolean' || col.type === 'bool') {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition -- value 可为 0/''/'false' 等空值
        return value ? 1 : 0
      }
      if (col.type === 'date' || col.type === 'datetime' || col.type === 'time') {
        if (value instanceof Date) return value.toISOString()
        return String(value)
      }
      return String(value)
    }

    if (typeof value === 'string' || typeof value === 'number') return value
    return String(value)
  }

  // ─────────────────────────────────────────────
  // 主键生成器
  // ─────────────────────────────────────────────

  /**
   * 配置主键生成器
   *
   * @param config 主键生成器配置
   *
   * @example
   * ```ts
   * // UUID生成器
   * view.setPrimaryKeyGenerator({ strategy: 'uuid', fields: 'id' })
   * // 自增ID
   * view.setPrimaryKeyGenerator({ strategy: 'auto-increment', fields: 'id', startValue: 1000 })
   * ```
   */
  setPrimaryKeyGenerator(config: PrimaryKeyGeneratorConfig): void {
    this._primaryKeyGenerator = createPrimaryKeyGenerator(config)
  }

  /** 移除主键生成器 */
  removePrimaryKeyGenerator(): void {
    this._primaryKeyGenerator = undefined
  }

  /**
   * 为新记录生成主键值
   *
   * @throws 如果未配置主键生成器
   */
  generatePrimaryKey(row: Partial<IDataRow>): IDataRow {
    if (!this._primaryKeyGenerator) {
      throw new Error('未配置主键生成器，请先调用 setPrimaryKeyGenerator()')
    }
    const pkValue = this._primaryKeyGenerator.generate(row, this._getRows())
    return { ...row, [this.primaryKey]: pkValue } as IDataRow
  }

  /**
   * 为新记录生成主键值（如果配置了生成器且行中缺少主键）
   *
   * @param row 部分数据行
   * @returns 包含主键的数据行（如果需要生成）或原始数据（如果已有主键）
   */
  ensurePrimaryKey(row: Partial<IDataRow>): IDataRow {
    if (!this._primaryKeyGenerator) {
      return row as IDataRow
    }
    const fields = this.effectivePkFields
    const hasPrimaryKey = fields.every(field => {
      const value = row[field]
      return value !== undefined && value !== null
    })
    if (hasPrimaryKey) {
      return row as IDataRow
    }
    return this.generatePrimaryKey(row)
  }

  /** 获取主键生成器配置 */
  getPrimaryKeyGeneratorConfig(): Readonly<PrimaryKeyGeneratorConfig> | undefined {
    return this._primaryKeyGenerator?.getConfig()
  }
}
