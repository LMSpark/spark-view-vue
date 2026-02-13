/**
 * 数据加载器（轻量级） - 处理表数据的智能加载
 * 
 * 职责：
 * - 📦 智能加载表数据（依赖分析、防重入）
 * - 🔄 自动处理依赖关系（根表优先加载）
 * - 🎯 触发关系过滤和选中管理
 * - 📢 发送加载事件通知
 * 
 * 核心原则：
 * - 异步非阻塞加载（不阻塞UI）
 * - 自动处理依赖链（递归加载父表）
 * - 防重入保护（避免重复加载）
 * - 事件驱动（通知订阅者）
 */

import type { DataSet } from '../dataset'
import { Logger } from '@spark-view/spark-utils'
import type { DataTable } from '../data-table'
import { rowsEqual } from './utils'

/**
 * 数据加载器类
 */
export class DataLoader {
  private logger = Logger()
  private loadingTables: Set<string> = new Set()
  
  constructor(private dataSet: DataSet) {}

  /**
   * 智能请求表数据（自动处理依赖）- 完全解耦：不阻塞，异步加载后通知订阅者
   * @param tableName 表名
   * 
   * 特性：
   * - 防重入检查（避免重复加载）
   * - 异步非阻塞（不影响UI响应）
   * - 自动依赖处理（递归加载父表）
   * - 事件通知（loadStart、loadSuccess、loadError）
   */
  requestTableData(tableName: string): void {
    // 防重入检查：如果表正在加载中，跳过
    if (this.loadingTables.has(tableName)) {
      this.logger.info(`⏭️ [DataLoader] 表 ${tableName} 正在加载中，跳过重复请求`)
      return
    }
    
    this.logger.info(`🔍 UI 请求表数据: ${tableName}`);
    this.dataSet.emit('loadStart', { tableName });
    
    // 标记为正在加载
    this.loadingTables.add(tableName)
    
    // 异步处理，不阻塞 UI
    this.requestTableDataAsync(tableName)
      .then(() => {
        // 加载完成，移除标记
        this.loadingTables.delete(tableName)
      })
      .catch((error: unknown) => {
        this.logger.error(`❌ 加载 ${tableName} 失败:`, error);
        this.dataSet.emit('loadError', { tableName, error });
        // 失败也要移除标记，否则永远不能重试
        this.loadingTables.delete(tableName)
      });
  }

  /**
   * 内部异步请求方法
   * 
   * 处理逻辑：
   * 1. 检查是否为依赖表（有父表）
   * 2. 根表：有数据直接用，无数据则加载
   * 3. 依赖表：检查依赖是否满足
   *    - 满足：加载数据并应用关系过滤
   *    - 不满足：加载根表，然后触发依赖更新事件
   */
  private async requestTableDataAsync(tableName: string): Promise<void> {
    const table = this.dataSet.getTable(tableName);
    
    // 检查是否为依赖表
    const dependencies = this.dataSet.getTableDependencies(tableName);
    const isDependentTable = dependencies.size > 0;
    
    // 仅对根表（无依赖）：如果已有数据，直接使用
    if (!isDependentTable && table?.rows && table.rows.length > 0) {
      this.logger.info(`✅ 根表 ${tableName} 已有数据（${table.rows.length} 行），直接使用`);
      this.dataSet.notifySubscribers(tableName);
      this.dataSet.emit('loadSuccess', { tableName });
      return;
    }
    
    // 依赖表即使有数据，也要重新过滤（因为父表 currentRow 可能变化）
    if (isDependentTable && table?.rows && table.rows.length > 0) {
      this.logger.info(`🔄 依赖表 ${tableName} 已有数据，重新应用过滤`);
      if (this.dataSet.areDependenciesSatisfied(tableName)) {
        // 查找所有关联的 autoLoad 关系
        const relations = this.dataSet.relations?.filter(
          rel => rel.childTable === tableName && rel.autoLoad
        ) ?? [];
        
        if (relations.length > 0) {
          this.logger.info(`🔄 处理 ${relations.length} 个 autoLoad 关系 for ${tableName}`);

          relations.forEach(relation => {
            this.dataSet.applyRelation(relation);
          });
        
          this.dataSet.notifySubscribers(tableName);
          this.dataSet.emit('loadSuccess', { tableName });
          return;
        }
      }
    }
    
    // 检查依赖是否满足
    if (this.dataSet.areDependenciesSatisfied(tableName)) {
      const dependencies = this.dataSet.getTableDependencies(tableName);
      
      // 如果是根表（无依赖）且无数据，需要加载
      if (dependencies.size === 0) {
        this.logger.info(`📦 ${tableName} 是根表且无数据，开始加载`);
        await this.loadTableData(tableName);
        this.dataSet.emit('loadSuccess', { tableName });
        return;
      }
      
      // 有依赖且依赖满足，检查是否需要加载数据
      this.logger.info(`✅ 依赖条件具备，检查 ${tableName} 是否需要加载数据`);
      
      // 使用 _originalRows 判断数据是否已加载
      const needsLoading = table && !table.originalRows;
      
      if (needsLoading) {
        this.logger.info(`📦 ${tableName} 数据未加载（originalRows 为空），开始加载`);
        await this.loadTableData(tableName);
      }
      
      // 数据加载完成后，应用关系过滤
      this.logger.info(`🔗 应用关系过滤: ${tableName}`);
      this.applyRelationsForTable(tableName);
      
      this.dataSet.notifySubscribers(tableName);
      this.dataSet.emit('loadSuccess', { tableName });
      return;
    }
    
    // 依赖不满足，找到根依赖并加载
    const rootTables = this.dataSet.getRootDependencies(tableName);
    
    if (rootTables.size === 0) {
      // 当前表本身就是根表，直接加载
      await this.loadTableData(tableName);
      this.dataSet.emit('loadSuccess', { tableName });
    } else {
      this.logger.info(`📦 需要先加载根依赖表: ${Array.from(rootTables).join(', ')}`);
      
      // 加载所有根表
      for (const rootTable of rootTables) {
        const rootTableData = this.dataSet.getTable(rootTable);
        if (!rootTableData?.rows || rootTableData.rows.length === 0) {
          await this.loadTableData(rootTable);
        }
      }
      
      // 根表加载完成后，通知子表依赖已更新
      this.notifyDependencyUpdated(tableName);
    }
  }

  /**
   * 加载表数据（调用外部数据加载器）
   * 
   * 职责：
   * 1. 调用外部 dataLoader 获取数据
   * 2. 更新表的 rows 和 originalRows
   * 3. 自动选中第一行（如果配置了 autoSelectFirst）
   * 4. 清理无效选中状态
   * 5. 应用父表过滤规则（如果是子表）
   * 6. 通知订阅者和子表
   * 7. 管理视图状态（loading/ready/error）
   */
  private async loadTableData(tableName: string): Promise<void> {
    if (!this.dataSet.dataLoader) {
      this.logger.warn(`⚠️ 未配置数据加载器，无法加载 ${tableName}`);
      return;
    }
    
    const table = this.dataSet.getTable(tableName);
    
    // ✅ 标记视图为加载中（非阻塞设计）
    if (table) {
      await table.setLoading();
    }
    
    this.logger.info(`🌐 开始加载数据: ${tableName}`);
    
    try {
      const rows = await this.dataSet.dataLoader(tableName);
      
      if (table) {
        // 检查 rows 是否变化
        const existingRows = table.rows || []
        const rowsChanged = !rowsEqual(existingRows, rows)
        
        if (!rowsChanged) {
          this.logger.info(`⏭️ [DataLoader] ${tableName}.rows 未变化，跳过通知`)
          // ✅ 即使数据未变化，也标记为就绪
          await table.setReady();
          return
        }
        
        // 将数据加载到默认上下文（table 本身）
        table.rows.splice(0, table.rows.length, ...rows);
        this.logger.info(`✅ 数据加载成功: ${tableName}，共 ${rows.length} 行`);
        
        // 缓存原始完整数据
        if (!table.originalRows) {
          table.originalRows = [...rows];
          this.logger.info(`💾 [默认上下文] 缓存原始数据: ${tableName} (${table.originalRows.length} 条)`);
        }
        
        // ✨ 自动选中第一行（如果配置了 autoSelectFirst）
        if (table.autoSelectFirst && rows.length > 0 && !table.currentRow) {
          this.logger.info(`🎯 自动选中第一行: ${tableName}`);
          table.setCurrentRow(rows[0] ?? null, false);  // 不跳过通知，触发级联
        }
        
        // 检查并清理所有上下文的无效选中状态
        this.cleanupInvalidSelections(table);
        
        // 数据加载完成后，如果该表是子表，重新应用父表的过滤规则
        const parentRelations = this.dataSet.relations?.filter(
          rel => rel.childTable === tableName
        ) ?? [];
        
        if (parentRelations.length > 0) {
          this.logger.info(`🔄 [加载完成] ${tableName} 是子表，重新应用 ${parentRelations.length} 个父表过滤规则`);
          parentRelations.forEach(relation => {
            const result = this.dataSet.applyRelation(relation);
            if (result.changed) {
              this.logger.info(`✅ [加载后过滤] ${relation.childTable}.${relation.childContextId ?? 'default'} 过滤完成: ${result.message}`);
            }
          });
        }
        
        // ✅ 标记视图为就绪状态（数据加载成功）
        await table.setReady();
        
        // 数据加载并过滤完成，通知UI订阅者
        this.dataSet.notifySubscribers(tableName);
        
        // 通知子表：父表数据已更新
        this.notifyChildTables(tableName);
      }
    } catch (error) {
      this.logger.error(`❌ 加载数据失败: ${tableName}`, error);
      
      // ✅ 标记视图为错误状态（支持自动重试）
      if (table) {
        await table.setError(error instanceof Error ? error : new Error(String(error)));
      }
      
      throw error;
    }
  }

  /**
   * 清理表的所有上下文的无效选中状态
   * 
   * 场景：数据加载后，之前的选中行可能不存在了
   */
  private cleanupInvalidSelections(table: DataTable): void {
    const tableName = table.hostTable;
    let needsNotify = false;
    
    // 清理默认上下文（table 本身）
    if (table.cleanupInvalidSelections()) {
      needsNotify = true;
    }
    
    // 清理所有自定义上下文
    if (table.contexts) {
      Object.values(table.contexts).forEach(context => {
        if (context.cleanupInvalidSelections()) {
          needsNotify = true;
        }
      });
    }
    
    // 如果清理了选中状态，触发相关事件
    if (needsNotify) {
      this.dataSet.emit('selectionCleaned', { tableName });
    }
  }

  /**
   * 通知依赖已更新（触发事件，不自动加载）
   * 
   * 使用场景：
   * - 父表数据加载完成后，通知子表可以开始加载
   * - 根据子表是否有订阅者和依赖条件，决定是否自动加载
   */
  notifyDependencyUpdated(tableName: string): void {
    this.logger.info(`📢 通知 ${tableName}: 依赖数据已更新，请根据需要加载`);
    this.dataSet.emit('dependencyUpdated', { tableName });
    
    const shouldAutoLoad = this.shouldAutoLoadDependentTable(tableName);
    
    // 检查该表的任意视图是否有订阅者
    const hasSubscribers = this.dataSet.hasSubscribers(tableName);
    
    if (shouldAutoLoad && hasSubscribers) {
      this.logger.info(`🎯 ${tableName} 依赖条件满足且有 UI 订阅者，自动加载数据`);
      this.loadTableData(tableName).catch(err => {
        this.logger.error(`❌ 自动加载 ${tableName} 失败:`, err);
      });
    } else if (!shouldAutoLoad) {
      this.logger.info(`⏸️ ${tableName} 依赖条件未满足（如 currentRow 为空），暂不加载`);
    }
  }

  /**
   * 判断依赖表是否应该自动加载
   * 
   * 检查规则：
   * - currentRow 依赖：父表必须有 currentRow
   * - selectedRows 依赖：父表必须有选中行
   * - allRows 依赖：总是返回 true
   */
  private shouldAutoLoadDependentTable(tableName: string): boolean {
    const relations = this.dataSet.relations?.filter(rel => rel.childTable === tableName) ?? [];
    
    for (const relation of relations) {
      const parentContext = this.dataSet.getContext(relation.parentTable, relation.parentContextId);
      
      if (!parentContext) continue;
      
      // 检查依赖类型
      if (relation.dependencyType === 'currentRow') {
        if (parentContext.currentRow) {
          return true;
        }
      } else if (relation.dependencyType === 'selectedRows') {
        if (parentContext.selectedRows && parentContext.selectedRows.length > 0) {
          return true;
        }
      } else if (relation.dependencyType === 'allRows') {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 通知子表：父表数据已更新
   * 委托给 RelationEngine 处理
   */
  private notifyChildTables(parentTableName: string): void {
    // 直接访问 DataSet 的 relationEngine
    this.dataSet['relationEngine'].notifyChildTables(parentTableName)
  }

  /**
   * 应用与指定表相关的所有关系
   * 
   * 场景：数据加载完成后，应用父表的过滤规则
   */
  private applyRelationsForTable(tableName: string): void {
    if (!this.dataSet.relations) return;
    
    // 找到所有以此表为子表的关系
    const relations = this.dataSet.relations.filter(
      rel => rel.childTable === tableName
    );
    
    relations.forEach(relation => {
      this.dataSet.applyRelation(relation);
    });
  }

  /**
   * 检查表是否正在加载
   * @param tableName 表名
   * @returns 是否正在加载
   */
  isLoading(tableName: string): boolean {
    return this.loadingTables.has(tableName);
  }

  /**
   * 获取所有正在加载的表
   * @returns 正在加载的表名集合
   */
  getLoadingTables(): Set<string> {
    return new Set(this.loadingTables);
  }
}
