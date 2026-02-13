/**
 * 关系引擎（轻量级） - UI-API 桥接层
 * 
 * 职责：
 * - 🎯 管理UI状态（选中行、当前行、清空状态）
 * - 📋 构建API参数（级联标记、过滤表达式、外键映射）
 * - 🔄 触发关系更新通知
 * 
 * ⚠️ 不再负责：
 * - ❌ 前端执行级联更新/删除（应由后端API处理）
 * - ❌ 前端执行数据过滤（应从后端获取已过滤数据）
 * - ❌ 前端遍历修改子表数据（应由后端批量处理）
 * 
 * 使用方式：
 * ```typescript
 * // 级联删除示例
 * const affectedTables = relationEngine.cascadeDelete(tableName, row)
 * // 返回 ['childTable1', 'childTable2']，提示需要调用后端API
 * // 实际删除：DELETE /api/{tableName}/{id}?cascade=true
 * 
 * // 关系过滤示例
 * relationEngine.applyRelation(relation)
 * // 内部构建 FilterExpression，触发数据加载
 * // 实际过滤：GET /api/{childTable}?filter={expr}&parentIds=[...]
 * ```
 */

import type {
  DataRelation,
  IDataRow,
  DependencyType,
  FilterExpression,
  IDataView
} from '../types'
import type { DataSet } from '../dataset'
import type { DataView } from '../data-view'
import { Logger } from '@spark-view/spark-utils'
import { rowsEqual, isSameRow } from './utils'

/**
 * 关系引擎类
 */
export class RelationEngine {
  private logger = Logger()
  
  constructor(private dataSet: DataSet) {}

  /**
   * 应用数据关系（根据父表状态过滤子表）
   * @param relation 关系定义
   * @returns 是否发生了数据变化
   */
  applyRelation(relation: DataRelation): { changed: boolean; message: string } {
    // 解析父上下文
    const parentTable = this.dataSet.getTable(relation.parentTable);
    if (!parentTable) {
      return { changed: false, message: `父表 ${relation.parentTable} 不存在` };
    }
    
    const parentContext = parentTable.getOrCreateContext(relation.parentContextId ?? 'default');
    
    // 解析子表和子上下文
    const childTable = this.dataSet.getTable(relation.childTable);
    if (!childTable) {
      return { changed: false, message: `子表 ${relation.childTable} 不存在` };
    }
    
    const childContext = childTable.getOrCreateContext(relation.childContextId ?? 'default');

    this.logger.info(`🔗 [RelationEngine.applyRelation] ${relation.parentTable}.${relation.parentContextId} -> ${relation.childTable}.${relation.childContextId}`, {
      dependencyType: relation.dependencyType,
      autoLoad: relation.autoLoad
    });

    // 根据依赖类型获取父级数据
    const parentRows = this.getParentRows(parentContext, relation.dependencyType);
    
    // ⚠️ 父表条件不满足：递归清空子表及其所有后代
    if (!parentRows || parentRows.length === 0) {
      this.logger.info(`🧹 条件不满足：清空子表 ${relation.childTable}.${relation.childContextId}（父表无选中数据）`);
      
      const hadData = childContext.rows.length > 0 || childContext.currentRow !== null;
      
      // 清空子上下文的所有状态
      childContext.clearAll(true);  // skipNotify=true，稍后统一通知
      
      if (hadData) {
        // 📢 通知订阅者：子表已清空
        this.dataSet.notifySubscribers(relation.childTable, relation.childContextId ?? 'default');
        
        // 🔗 递归清空：通知孙表也要清空
        this.recursiveClearChildTables(relation.childTable, relation.childContextId ?? 'default');
        
        return { changed: true, message: `清空 ${relation.childTable}.${relation.childContextId} (父表无选中数据)` };
      }
      
      return { changed: false, message: `${relation.childTable}.${relation.childContextId} 已为空` };
    }
    
    // 如果是 autoLoad，且数据未加载，返回等待加载
    if (relation.autoLoad && (!childContext.originalRows || childContext.originalRows.length === 0)) {
      return { changed: false, message: `autoLoad 等待数据加载: ${relation.childTable}` };
    }
    
    // 非 autoLoad，且数据未加载，跳过
    if (!relation.autoLoad && (!childContext.originalRows || childContext.originalRows.length === 0)) {
      return { changed: false, message: `非 autoLoad 且数据未加载: ${relation.childTable}` };
    }
    
    // 应用过滤：从子上下文的原始数据中过滤
    const sourceRows = childContext.originalRows ?? [];
    const filteredRows = this.filterChildRows(
      sourceRows,
      relation.filterExpression,
      parentRows,
      parentContext
    );
    
    // 检查过滤结果是否变化
    const existingRows = childContext.rows ?? [];
    const rowsChanged = !rowsEqual(existingRows, filteredRows);
    
    if (!rowsChanged) {
      return { changed: false, message: `过滤结果未变化` };
    }
    
    // 使用 splice 替换数组内容，保持响应式
    childContext.rows.splice(0, childContext.rows.length, ...filteredRows);
    
    // 🔄 rows 改变 → 重置选中状态
    let selectionChanged = false;
    
    // 1. 清理 currentRow：如果不在新结果中，则置空或自动选第0行
    const validCurrentRow = filteredRows.find(row => isSameRow(row, childContext.currentRow));
    if (childContext.currentRow && !validCurrentRow) {
      if (childContext.autoSelectFirst && filteredRows.length > 0) {
        this.logger.info(`🎯 [自动选择] ${relation.childTable}.${relation.childContextId ?? 'default'} 自动选中第0行`);
        childContext.currentRow = filteredRows[0] ?? null;
      } else {
        this.logger.info(`🧹 [清理] ${relation.childTable}.${relation.childContextId ?? 'default'} currentRow 置空`);
        childContext.currentRow = null;
      }
      selectionChanged = true;
    } else if (!childContext.currentRow && childContext.autoSelectFirst && filteredRows.length > 0) {
      // 如果之前没有 currentRow，且配置了自动选择，则选中第0行
      this.logger.info(`🎯 [自动选择] ${relation.childTable}.${relation.childContextId ?? 'default'} 自动选中第0行`);
      childContext.currentRow = filteredRows[0] ?? null;
      selectionChanged = true;
    }
    
    // 2. 清理 selectedRows：移除不在新结果中的行
    const validSelectedRows = childContext.selectedRows?.filter(row => 
      filteredRows.some(fr => isSameRow(fr, row))
    ) ?? [];
    if (childContext.selectedRows && childContext.selectedRows.length !== validSelectedRows.length) {
      this.logger.info(`🧹 [清理] ${relation.childTable}.${relation.childContextId ?? 'default'} selectedRows 从 ${childContext.selectedRows.length} → ${validSelectedRows.length}`);
      // ✅ 使用 setSelectedRows 方法，触发 UI 同步
      childContext.setSelectedRows(validSelectedRows, false); // skipNotify=false，需要同步 UI
      selectionChanged = true;
    }
    
    // 🔗 如果选中状态发生变化，触发子表更新（级联）
    if (selectionChanged) {
      this.logger.info(`🔗 [级联] ${relation.childTable}.${relation.childContextId ?? 'default'} 选中状态已变化，触发子表更新`);
      this.updateRelatedTables(relation.childTable, relation.childContextId ?? 'default');
      
      // 🔔 通知订阅者：选中状态已变化（触发 UI 更新）
      // 注意：这里会触发 rebindRules，让 el-table 重新渲染（从而清空复选框）
      this.dataSet.notifySubscribers(relation.childTable, relation.childContextId ?? 'default');
    }
    
    return { 
      changed: true, 
      message: `过滤完成: ${filteredRows.length}/${sourceRows.length} 条` 
    };
  }

  /**
   * 级联更新（轻量化 - 仅返回受影响的表名）
   * ⚠️ 前端不再执行级联更新逻辑，应通过后端API处理
   * 
   * 使用建议：
   * 1. 调用后端 API: PUT /api/{parentTable}/{id}?cascade=true
   * 2. 后端根据 DataRelation 配置执行级联更新
   * 3. 前端接收后端返回的更新结果并刷新UI
   */
  cascadeUpdate(tableName: string, row: IDataRow, oldValues?: IDataRow): string[] {
    this.logger.info(`📋 [RelationEngine] cascadeUpdate 已简化为轻量模式`);
    this.logger.info(`   建议：调用后端 API 执行级联更新`, { tableName, row, oldValues });
    
    // 返回可能受影响的子表名称（用于提示）
    const relations = this.dataSet.relations?.filter(
      rel => rel.parentTable === tableName && rel.cascadeUpdate
    ) ?? [];
    
    return relations.map(rel => rel.childTable);
  }

  /**
   * 级联删除（轻量化 - 仅返回受影响的表名）
   * ⚠️ 前端不再执行级联删除逻辑，应通过后端API处理
   * 
   * 使用建议：
   * 1. 调用后端 API: DELETE /api/{parentTable}/{id}?cascade=true
   * 2. 后端根据 DataRelation 配置执行级联删除
   * 3. 前端接收后端返回的删除结果并刷新UI
   */
  cascadeDelete(tableName: string, row: IDataRow): string[] {
    this.logger.info(`📋 [RelationEngine] cascadeDelete 已简化为轻量模式`);
    this.logger.info(`   建议：调用后端 API 执行级联删除`, { tableName, row });
    
    // 返回可能受影响的子表名称（用于提示）
    const relations = this.dataSet.relations?.filter(
      rel => rel.parentTable === tableName && rel.cascadeDelete
    ) ?? [];
    
    return relations.map(rel => rel.childTable);
  }

  /**
   * 从 FilterExpression 提取外键字段映射
   * 用于构建 API 参数，不再用于前端数据操作
   */
  extractForeignKeyMap(expr: FilterExpression): Array<{ childField: string; parentField: string }> {
    const result: Array<{ childField: string; parentField: string }> = [];

    // 递归解析表达式
    const parse = (node: FilterExpression): void => {
      // 逻辑组合节点
      if ('children' in node && Array.isArray(node.children)) {
        node.children.forEach((child: FilterExpression) => parse(child));
        return;
      }

      // 单一条件节点
      if ('field' in node && 'op' in node && 'value' in node) {
        // 检查 value 是否是 FIELD() 函数调用
        if (typeof node.value === 'object' && node.value !== null) {
          const value = node.value as Record<string, unknown>;
          if ('func' in value && value.func === 'FIELD' && Array.isArray(value.args)) {
            result.push({
              childField: node.field,
              parentField: (value.args as unknown[])[0] as string
            });
          }
        }
      }
    };

    parse(expr);
    return result;
  }

  /**
   * 根据依赖类型获取父数据范围
   */
  getParentRows(
    parentContext: DataView | IDataView,
    dependencyType: DependencyType
  ): IDataRow[] | undefined {
    switch (dependencyType) {
      case 'currentRow':
        return parentContext.currentRow ? [parentContext.currentRow] : [];
      case 'selectedRows':
        return parentContext.selectedRows ?? [];
      case 'allRows':
        return parentContext.rows ?? [];
      case 'pagedRows': {
        // 返回当前分页的数据行（基于 context.rows 切片）
        const rows = parentContext.rows ?? [];
        const pageSize = parentContext.pageSize ?? 20;
        const page = parentContext.page ?? 1;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return rows.slice(start, end);
      }
      default:
        // 自定义类型，暂时返回 currentRow
        return parentContext.currentRow ? [parentContext.currentRow] : [];
    }
  }

  /**
   * 过滤子表数据（轻量化 - 返回原始数据）
   * ⚠️ 前端不再执行过滤逻辑，应通过后端API获取已过滤的数据
   * 
   * 使用建议：
   * 1. 构建 API 参数: GET /api/{childTable}?filter={filterExpression}&parentIds=[...]
   * 2. 后端根据 FilterExpression 和父表ID执行过滤
   * 3. 前端直接使用后端返回的已过滤数据
   */
  filterChildRows(
    childRows: IDataRow[],
    filterExpression: FilterExpression,
    parentRows: IDataRow[],
    _parentContext: DataView | IDataView
  ): IDataRow[] {
    this.logger.info(`📋 [RelationEngine] filterChildRows 已简化为轻量模式`);
    this.logger.info(`   建议：通过后端 API 获取已过滤数据`, { 
      filterExpression, 
      parentRowCount: parentRows.length 
    });
    
    // 直接返回原始数据，不执行前端过滤
    // 实际过滤应由后端API完成
    return childRows;
  }

  /**
   * 更新相关联的子表
   */
  updateRelatedTables(parentTableName: string, parentContextId: string = 'default'): void {
    if (!this.dataSet.relations) return;

    // 找到所有以此表为父表，且 parentContext 匹配的关系
    const relations = this.dataSet.relations.filter(rel => {
        if (rel.parentTable !== parentTableName) return false;
        
        // 匹配 contextId
        return rel.parentContextId === parentContextId;
    });

    this.logger.info(`🔗 [RelationEngine] 上下文 ${parentTableName}.${parentContextId} 触发了 ${relations.length} 个关联更新`);

    relations.forEach(relation => {
      const childContext = this.dataSet.getContext(relation.childTable, relation.childContextId ?? 'default');
      
      // ✅ 检查是否需要自动加载子表数据
      if (childContext && relation.autoLoad && (!childContext.originalRows || childContext.originalRows.length === 0)) {
        this.logger.info(`🚀 [AutoLoad] ${relation.childTable} 数据未加载，触发自动加载`);
        this.dataSet.requestTableData(relation.childTable);
        // 跳过本次 applyRelation，等待 loadTableData 完成后自动应用
        return;
      }
      
      // 数据已加载（或非 autoLoad），立即应用过滤规则
      const result = this.applyRelation(relation);
      
      // 如果数据变化了，通知子表的订阅者
      if (result.changed) {
        this.logger.info(`✅ [RelationEngine] ${relation.childTable}.${relation.childContextId ?? 'default'} 数据已更新: ${result.message}`);
        this.dataSet.notifySubscribers(relation.childTable, relation.childContextId ?? 'default');
      } else {
        this.logger.info(`⏭️ [RelationEngine] ${relation.childTable}.${relation.childContextId ?? 'default'} 无变化: ${result.message}`);
      }
    });
  }

  /**
   * 通知子表：父表数据已更新
   */
  notifyChildTables(parentTableName: string): void {
    if (!this.dataSet.relations) return;
    
    // 找到所有以此表为父表的子表
    const childRelations = this.dataSet.relations.filter(
      rel => rel.parentTable === parentTableName
    );
    
    childRelations.forEach(relation => {
      this.logger.info(`📢 通知子表 ${relation.childTable}: 父表 ${parentTableName} 数据已更新`);
      this.dataSet.notifyDependencyUpdated(relation.childTable);
    });
  }

  /**
   * 刷新所有关系
   */
  refreshAllRelations(): void {
    if (!this.dataSet.relations) return;

    this.dataSet.relations.forEach(relation => {
      this.applyRelation(relation);
    });
  }

  /**
   * 递归清空子表及其所有后代（用于父表条件不满足时）
   */
  private recursiveClearChildTables(parentTableName: string, parentContextId: string = 'default'): void {
    if (!this.dataSet.relations) return;
    
    // 找到所有以此表/上下文为父的子表
    const childRelations = this.dataSet.relations.filter(
      rel => rel.parentTable === parentTableName && 
             (rel.parentContextId ?? 'default') === parentContextId
    );
    
    childRelations.forEach(relation => {
      const childContextId = relation.childContextId ?? 'default';
      const childContext = this.dataSet.getContext(relation.childTable, childContextId);
      
      if (childContext && (childContext.rows.length > 0 || childContext.currentRow !== null)) {
        this.logger.info(`🧹 递归清空子表: ${relation.childTable}.${childContextId}`);
        
        // 清空子表状态
        childContext.clearAll(true);  // skipNotify=true，稍后统一通知
        
        // 通知订阅者
        this.dataSet.notifySubscribers(relation.childTable, childContextId);
        
        // 递归清空孙表
        this.recursiveClearChildTables(relation.childTable, childContextId);
      }
    });
  }

}
