import { DSLDocument } from '@spark-view/dsl-parser';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DslStorageOptions {
  // 可以扩展为数据库配置
}

/**
 * DSL存储管理器 - 简单的内存实现
 * 生产环境应该使用 MongoDB/PostgreSQL
 */
export class DslStorage {
  private store: Map<string, { dsl: DSLDocument; updatedAt: Date; version: number }>;

  constructor(_options?: DslStorageOptions) {
    this.store = new Map();
  }

  /**
   * 保存DSL文档
   */
  async save(id: string, dsl: DSLDocument): Promise<void> {
    const existing = this.store.get(id);
    const version = existing ? existing.version + 1 : 1;
    
    this.store.set(id, {
      dsl,
      updatedAt: new Date(),
      version
    });
  }

  /**
   * 获取DSL文档
   */
  async get(id: string): Promise<DSLDocument | null> {
    const record = this.store.get(id);
    return record ? record.dsl : null;
  }

  /**
   * 更新单个页面
   */
  async updatePage(id: string, pageId: string, pageData: Partial<unknown>): Promise<boolean> {
    const record = this.store.get(id);
    if (!record) {
      return false;
    }

    const dsl = record.dsl;
    
    // 多页面模式
    if (dsl.pages) {
      const pageIndex = dsl.pages.findIndex(p => p.id === pageId);
      if (pageIndex >= 0) {
        dsl.pages[pageIndex] = { ...dsl.pages[pageIndex], ...pageData };
        record.version++;
        record.updatedAt = new Date();
        return true;
      }
    }
    
    // 单页面模式
    if (dsl.page && dsl.page.id === pageId) {
      dsl.page = { ...dsl.page, ...pageData };
      record.version++;
      record.updatedAt = new Date();
      return true;
    }

    return false;
  }

  /**
   * 删除DSL文档
   */
  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /**
   * 列出所有DSL
   */
  async list(): Promise<Array<{ id: string; version: number; updatedAt: Date }>> {
    const result: Array<{ id: string; version: number; updatedAt: Date }> = [];
    
    for (const [id, record] of this.store.entries()) {
      result.push({
        id,
        version: record.version,
        updatedAt: record.updatedAt
      });
    }
    
    return result;
  }

  /**
   * 获取DSL版本号
   */
  async getVersion(id: string): Promise<number | null> {
    const record = this.store.get(id);
    return record ? record.version : null;
  }
}
