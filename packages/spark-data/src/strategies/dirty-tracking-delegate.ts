/**
 * DirtyTrackingDelegate — 本地变更追踪委托（三态：新增 / 编辑 / 待删除）
 *
 * ## 背景
 *
 * DataView.rows 与 UI 双向绑定，增删改立即反映到界面，但不自动提交服务端。
 * 本 delegate 追踪三种"本地-only"操作，由 saveChanges() 统一提交。
 *
 * | DataView 方法      | 本地 rows | 服务端 | 追踪类型        |
 * |--------------------|-----------|--------|-----------------|
 * | addRow(data)       | 立即追加  | ❌     | pending create  |
 * | editRowById(id, d) | 立即更新  | ❌     | dirty update    |
 * | removeRow(id)      | 立即删除  | ❌     | pending delete  |
 *
 * ## 行级状态机
 *
 * ```
 * [server-clean]
 *     ├─ editRowById  → [dirty update]
 *     │     └─ removeRow → [pending delete]（清除 dirty）
 *     └─ removeRow    → [pending delete]
 *
 * [pending create]（本地新行，服务端不存在）
 *     ├─ editRowById  → 无需额外标记（行本身就是最新状态）
 *     └─ removeRow    → 取消创建（不产生 server delete）
 * ```
 *
 * ## 快照弱引用策略
 *
 * - **dirty update 快照** (`_dirtySnapshots`)：`WeakRef`——仅用于 diff/撤销，
 *   内存紧张时允许 GC 回收，saveChanges 降级为"提交当前行数据"。
 * - **pending delete 快照** (`_deleteSnapshots`)：强引用——提交失败可将行还原回 UI。
 */

import type { IDataRow } from '../types'

// ─────────────────────────────────────────────
// 导出类型
// ─────────────────────────────────────────────

/** 单字段变更记录（from → to） */
export interface FieldChange {
  /** 修改前的原始值 */
  from: unknown
  /** 修改后的当前值 */
  to: unknown
}

/** 行级字段变更映射（字段名 → 变更） */
export type RowDiff = Record<string, FieldChange>

/**
 * saveChanges() 执行结果（三态统计）
 */
export interface SaveChangesData {
  /** 新增行成功提交数 */
  createdCount: number
  /** 编辑行成功保存数 */
  savedCount: number
  /** 删除行成功提交数 */
  deletedCount: number
  /** 总失败数（三态合计） */
  failedCount: number
  /** 失败的行主键列表（可用于精准重试或 UI 高亮） */
  failedIds: Array<string | number>
}

// ─────────────────────────────────────────────
// DirtyTrackingDelegate
// ─────────────────────────────────────────────

export class DirtyTrackingDelegate {

  // ── pending creates ───────────────────────
  /** 待新增行数据（pk → row），行从未在服务端存在，强引用保留 */
  private _createRows = new Map<string | number, IDataRow>()

  // ── dirty updates ─────────────────────────
  /** 被手工编辑的行主键集合 */
  private _dirtyIds = new Set<string | number>()
  /**
   * 首次编辑前的行快照（弱引用）。
   * 连续编辑不覆盖——diff 始终相对于服务端原始值。
   * WeakRef：GC 压力下允许回收，saveChanges 降级为"提交当前数据"。
   */
  private _dirtySnapshots = new Map<string | number, WeakRef<IDataRow>>()

  // ── pending deletes ───────────────────────
  /** 待删除行主键集合 */
  private _deleteIds = new Set<string | number>()
  /** 待删除行快照（强引用：提交失败时需还原 UI） */
  private _deleteSnapshots = new Map<string | number, IDataRow>()

  // ─────────────────────────────────────────────
  // 写入 — 新增
  // ─────────────────────────────────────────────

  /**
   * 将行登记为"待新增"。
   *
   * 特殊情况：若该 id 曾被登记为待删除（先删后撤销），则改为撤销删除，
   * 新行直接进入 clean 状态（仅还原，不重复追踪新增）。
   */
  trackCreate(id: string | number, row: IDataRow): void {
    if (this._deleteIds.has(id)) {
      // 撤销删除：清除 pending delete，行回到 clean
      this._deleteIds.delete(id)
      this._deleteSnapshots.delete(id)
      return
    }
    this._createRows.set(id, row)
  }

  /**
   * 取消指定行的"待新增"登记。
   *
   * 场景：pending create 行在未保存前被用户删除——无需 server delete，直接遗忘。
   * @returns 该行是否确实是 pending create（false = 不是，无操作）
   */
  cancelCreate(id: string | number): boolean {
    if (!this._createRows.has(id)) return false
    this._createRows.delete(id)
    return true
  }

  // ─────────────────────────────────────────────
  // 写入 — 编辑
  // ─────────────────────────────────────────────

  /**
   * 标注指定行为手工编辑（dirty update）。
   *
   * - pending create 行：**忽略**（新行本身就是最终数据，无需记录"编辑前"快照）
   * - 连续编辑同一行：**不覆盖快照**（diff 始终相对于服务端原始值）
   *
   * @param id       行主键
   * @param original 编辑**前**的行对象（浅拷贝后以 WeakRef 包装）
   */
  markDirty(id: string | number, original: IDataRow): void {
    if (this._createRows.has(id)) return   // pending create 不需要 dirty 追踪
    if (!this._dirtyIds.has(id)) {
      this._dirtySnapshots.set(id, new WeakRef({ ...original }))
    }
    this._dirtyIds.add(id)
  }

  /**
   * 清除指定行（或全部）的 dirty-update 状态。
   * @param id 不传则清除全部
   */
  clearDirty(id?: string | number): void {
    if (id !== undefined) {
      this._dirtyIds.delete(id)
      this._dirtySnapshots.delete(id)
    } else {
      this._dirtyIds.clear()
      this._dirtySnapshots.clear()
    }
  }

  // ─────────────────────────────────────────────
  // 写入 — 删除
  // ─────────────────────────────────────────────

  /**
   * 将行登记为"待删除"。
   *
   * 特殊情况：若该行是 pending create（从未在服务端存在），
   * 直接取消新增，**不产生** server delete。
   *
   * @param id       行主键
   * @param snapshot 被删除行的完整快照（强引用，提交失败时用于还原 UI）
   */
  trackDelete(id: string | number, snapshot: IDataRow): void {
    if (this._createRows.has(id)) {
      // 本地新行被删除 → 取消新增即可，不产生 server delete
      this.cancelCreate(id)
      return
    }
    // 若该行同时有 dirty update，清除（待删除优先于待保存）
    this._dirtyIds.delete(id)
    this._dirtySnapshots.delete(id)

    if (!this._deleteIds.has(id)) {
      this._deleteIds.add(id)
      this._deleteSnapshots.set(id, { ...snapshot })
    }
  }

  /**
   * 撤销指定行（或全部）的 pending-delete 状态。
   *
   * 注意：撤销仅清除追踪记录，**不**自动将行还原回 rows——
   * 由调用方（DataView）负责将快照 appendRow 回去。
   */
  cancelDelete(id?: string | number): void {
    if (id !== undefined) {
      this._deleteIds.delete(id)
      this._deleteSnapshots.delete(id)
    } else {
      this._deleteIds.clear()
      this._deleteSnapshots.clear()
    }
  }

  /**
   * 清除全部三态追踪状态（视图全量刷新 / 销毁时调用）。
   */
  clearAll(): void {
    this._createRows.clear()
    this._dirtyIds.clear()
    this._dirtySnapshots.clear()
    this._deleteIds.clear()
    this._deleteSnapshots.clear()
  }

  // ─────────────────────────────────────────────
  // 读取
  // ─────────────────────────────────────────────

  /**
   * 是否存在任意未提交的本地变更（新增 / 编辑 / 待删除）。
   *
   * @param id 不传 → 整个视图；传入 id → 指定行（任意态）
   */
  hasPendingChanges(id?: string | number): boolean {
    if (id !== undefined) {
      return this._createRows.has(id) || this._dirtyIds.has(id) || this._deleteIds.has(id)
    }
    return this._createRows.size > 0 || this._dirtyIds.size > 0 || this._deleteIds.size > 0
  }

  /**
   * 是否有 dirty-update 未提交。
   * @param id 不传 → 整体；传入 id → 指定行
   */
  isDirty(id?: string | number): boolean {
    if (id !== undefined) return this._dirtyIds.has(id)
    return this._dirtyIds.size > 0
  }

  /** 指定行是否是待新增状态 */
  isPendingCreate(id: string | number): boolean { return this._createRows.has(id) }

  /** 指定行是否是待删除状态 */
  isPendingDelete(id: string | number): boolean { return this._deleteIds.has(id) }

  /** 全部 dirty-update 行主键（ReadonlySet） */
  get dirtyRowIds(): ReadonlySet<string | number> { return this._dirtyIds }

  /** 待新增行主键（ReadonlySet） */
  get pendingCreateIds(): ReadonlySet<string | number> {
    return new Set(this._createRows.keys())
  }

  /** 待新增行数组 */
  get pendingCreateRows(): IDataRow[] { return [...this._createRows.values()] }

  /** 待删除行主键（ReadonlySet） */
  get pendingDeleteIds(): ReadonlySet<string | number> { return this._deleteIds }

  /**
   * 获取 pending-delete 行的快照（提交失败时用于还原 UI）。
   */
  getPendingDeleteSnapshot(id: string | number): IDataRow | undefined {
    return this._deleteSnapshots.get(id)
  }

  /**
   * 获取指定行在首次手工编辑**前**的快照（dirty update 专用）。
   *
   * @returns 快照；行不脏或弱引用已被 GC 回收时返回 undefined
   */
  getOriginal(id: string | number): IDataRow | undefined {
    return this._dirtySnapshots.get(id)?.deref()
  }

  /**
   * 计算指定行的字段级变更明细（dirty update 专用）。
   *
   * @param id      行主键
   * @param current 当前行对象
   * @returns 字段名 → `{ from, to }`；行不脏或快照已被 GC 回收时返回 `{}`
   */
  getDiff(id: string | number, current: IDataRow): RowDiff {
    const original = this._dirtySnapshots.get(id)?.deref()
    if (!original) return {}

    const diff: RowDiff = {}
    const allKeys = new Set([...Object.keys(original), ...Object.keys(current)])
    for (const key of allKeys) {
      const fromVal = (original as Record<string, unknown>)[key]
      const toVal = (current as Record<string, unknown>)[key]
      if (!Object.is(fromVal, toVal)) diff[key] = { from: fromVal, to: toVal }
    }
    return diff
  }

  // ─────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────

  /** 销毁——清理所有内存状态 */
  destroy(): void { this.clearAll() }
}
