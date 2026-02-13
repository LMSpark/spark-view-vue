/**
 * spark-data 内部工具函数
 */

import type { IDataRow } from '../types'

/**
 * 比较两个数据行数组是否相等（引用比较）
 * 
 * 高性能浅比较：仅检查数组长度和每个位置的引用是否相同
 * 适用于判断数据是否变化，避免不必要的通知
 * 
 * @param rows1 第一个数据行数组
 * @param rows2 第二个数据行数组
 * @returns 是否相等
 */
export function rowsEqual(rows1: IDataRow[], rows2: IDataRow[]): boolean {
  if (rows1.length !== rows2.length) return false
  
  for (let i = 0; i < rows1.length; i++) {
    if (rows1[i] !== rows2[i]) return false
  }
  
  return true
}

/**
 * 通过主键或引用比较判断两行是否相同
 * 
 * @param row1 第一行数据
 * @param row2 第二行数据
 * @param idField 主键字段名，默认 'id'
 * @returns 是否相同
 */
export function isSameRow(
  row1: IDataRow | null, 
  row2: IDataRow | null, 
  idField: string = 'id'
): boolean {
  if (row1 === row2) return true
  if (!row1 || !row2) return false
  
  // 通过主键比较
  if (idField in row1 && idField in row2) {
    return row1[idField] === row2[idField]
  }
  
  // 没有主键则引用比较
  return false
}
