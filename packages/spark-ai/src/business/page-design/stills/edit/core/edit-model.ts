/**
 * EditModel — 编辑会话模型快照
 *
 * SSoT（单一真实源）包装器，统一管理：
 * - rule.json (from SparkNodeTree)
 * - pagedata.json (from DataSetCrudTool)  
 * - script.js (raw string)
 * - style.css (raw string)
 *
 * 提供快照缓存、汇总查询、文件导出等高级操作。
 */

import type { SparkNodeTree } from '@spark-view/spark-component'
import type { DataSetCrudTool } from '@spark-view/spark-data'

export interface EditModelSnapshot {
  rule: string
  pagedata: string
  script: string
  style: string
}

export interface EditChangedLinesSummary {
  rule: number
  pagedata: number
  script: number
  style: number
  total: number
}

export interface EditFilesExport {
  'rule.json': string
  'pagedata.json': string
  'script.js': string
  'style.css': string
}

/**
 * 编辑会话模型 — 统一的快照计算和对比接口
 */
export class EditModel {
  private _cachedSnapshot: EditModelSnapshot | null = null

  constructor(
    private nodeTree: SparkNodeTree | null,
    private datasetEdit: DataSetCrudTool | null,
    private script: string,
    private style: string,
  ) {}

  /**
   * 获取当前快照（缓存）。
   * 在同一 EditModel 实例内重用，避免重复计算。
   */
  get snapshot(): EditModelSnapshot {
    this._cachedSnapshot ??= this._buildSnapshot()
    return this._cachedSnapshot
  }

  /**
   * 内部：构建快照（每个 EditModel 实例仅调用一次）
   */
  private _buildSnapshot(): EditModelSnapshot {
    return {
      rule: stringifyJson(this._getRuleJson()),
      pagedata: stringifyJson(this.datasetEdit?.toJson() ?? { dataSetName: 'PageDataSet', tables: {} }),
      script: this.script,
      style: this.style,
    }
  }

  /**
   * 从 nodeTree 提取规则数组
   */
  private _getRuleJson(): unknown {
    const root = this.nodeTree?.toJSON()
    return Array.isArray(root?.children) ? root.children : []
  }

  /**
   * 对比两个快照，返回变更行数摘要
   */
  diffSnapshot(baseline: EditModelSnapshot): EditChangedLinesSummary {
    const snap = this.snapshot
    const rule = countChangedLines(baseline.rule, snap.rule)
    const pagedata = countChangedLines(baseline.pagedata, snap.pagedata)
    const script = countChangedLines(baseline.script, snap.script)
    const style = countChangedLines(baseline.style, snap.style)
    return {
      rule,
      pagedata,
      script,
      style,
      total: rule + pagedata + script + style,
    }
  }

  /**
   * 导出所有文件（当前快照）
   */
  exportFiles(): EditFilesExport {
    const snap = this.snapshot
    return {
      'rule.json': snap.rule,
      'pagedata.json': snap.pagedata,
      'script.js': snap.script,
      'style.css': snap.style,
    }
  }

}

/**
 * 计算两个文本之间的变更行数
 */
function countChangedLines(before: string, after: string): number {
  const beforeLines = before.split(/\r?\n/)
  const afterLines = after.split(/\r?\n/)
  const maxLen = Math.max(beforeLines.length, afterLines.length)
  let changed = 0
  for (let i = 0; i < maxLen; i += 1) {
    if ((beforeLines[i] ?? '') !== (afterLines[i] ?? '')) changed += 1
  }
  return changed
}

/**
 * 序列化 JSON（格式化输出）
 */
function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}
