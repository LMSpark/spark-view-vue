import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // 缓存过期时间（秒）
  prefix?: string; // 缓存键前缀
}

export class CacheManager {
  private redis: Redis;
  private prefix: string;

  constructor(redisUrl?: string, options: CacheOptions = {}) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.prefix = options.prefix || 'spark:';
  }

  /**
   * 获取页面级缓存
   */
  async getPage(dslId: string, pageId: string): Promise<string | null> {
    const key = this.getPageKey(dslId, pageId);
    return await this.redis.get(key);
  }

  /**
   * 设置页面级缓存
   */
  async setPage(dslId: string, pageId: string, html: string, ttl: number = 3600): Promise<void> {
    const key = this.getPageKey(dslId, pageId);
    await this.redis.setex(key, ttl, html);
  }

  /**
   * 获取页面缓存和时间戳
   */
  async getPageWithTimestamp(dslId: string, pageId: string): Promise<{ content: string; timestamp: number } | null> {
    const contentKey = this.getPageKey(dslId, pageId);
    const timestampKey = this.getPageTimestampKey(dslId, pageId);
    
    const [content, timestamp] = await this.redis.mget(contentKey, timestampKey);
    
    if (!content || !timestamp) {
      return null;
    }
    
    return {
      content,
      timestamp: parseInt(timestamp, 10)
    };
  }

  /**
   * 设置页面缓存和时间戳
   */
  async setPageWithTimestamp(dslId: string, pageId: string, html: string, ttl: number = 3600): Promise<number> {
    const timestamp = Date.now();
    const contentKey = this.getPageKey(dslId, pageId);
    const timestampKey = this.getPageTimestampKey(dslId, pageId);
    
    await Promise.all([
      this.redis.setex(contentKey, ttl, html),
      this.redis.setex(timestampKey, ttl, timestamp.toString())
    ]);
    
    return timestamp;
  }

  /**
   * 获取页面时间戳
   */
  async getPageTimestamp(dslId: string, pageId: string): Promise<number | null> {
    const key = this.getPageTimestampKey(dslId, pageId);
    const timestamp = await this.redis.get(key);
    return timestamp ? parseInt(timestamp, 10) : null;
  }

  /**
   * 获取路由配置缓存（文档级别）
   */
  async getRouterConfig(dslId: string): Promise<string | null> {
    const key = this.getRouterKey(dslId);
    return await this.redis.get(key);
  }

  /**
   * 设置路由配置缓存
   */
  async setRouterConfig(dslId: string, config: string, ttl: number = 3600): Promise<void> {
    const key = this.getRouterKey(dslId);
    await this.redis.setex(key, ttl, config);
  }

  /**
   * 获取路由配置和时间戳
   */
  async getRouterConfigWithTimestamp(dslId: string): Promise<{ config: string; timestamp: number } | null> {
    const configKey = this.getRouterKey(dslId);
    const timestampKey = this.getRouterTimestampKey(dslId);
    
    const [config, timestamp] = await this.redis.mget(configKey, timestampKey);
    
    if (!config || !timestamp) {
      return null;
    }
    
    return {
      config,
      timestamp: parseInt(timestamp, 10)
    };
  }

  /**
   * 设置路由配置和时间戳
   */
  async setRouterConfigWithTimestamp(dslId: string, config: string, ttl: number = 3600): Promise<number> {
    const timestamp = Date.now();
    const configKey = this.getRouterKey(dslId);
    const timestampKey = this.getRouterTimestampKey(dslId);
    
    await Promise.all([
      this.redis.setex(configKey, ttl, config),
      this.redis.setex(timestampKey, ttl, timestamp.toString())
    ]);
    
    return timestamp;
  }

  /**
   * 获取组件代码缓存
   */
  async getComponent(dslId: string, componentName: string): Promise<string | null> {
    const key = this.getComponentKey(dslId, componentName);
    return await this.redis.get(key);
  }

  /**
   * 设置组件代码缓存
   */
  async setComponent(dslId: string, componentName: string, code: string, ttl: number = 3600): Promise<void> {
    const key = this.getComponentKey(dslId, componentName);
    await this.redis.setex(key, ttl, code);
  }

  /**
   * 使指定DSL的所有缓存失效
   */
  async invalidateDsl(dslId: string): Promise<void> {
    const pattern = `${this.prefix}dsl:${dslId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * 使指定页面的缓存失效
   */
  async invalidatePage(dslId: string, pageId: string): Promise<void> {
    const key = this.getPageKey(dslId, pageId);
    await this.redis.del(key);
  }

  /**
   * 获取DSL元数据
   */
  async getDslMeta(dslId: string): Promise<Record<string, unknown> | null> {
    const key = this.getMetaKey(dslId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * 设置DSL元数据
   */
  async setDslMeta(dslId: string, meta: Record<string, unknown>, ttl: number = 3600): Promise<void> {
    const key = this.getMetaKey(dslId);
    await this.redis.setex(key, ttl, JSON.stringify(meta));
  }

  /**
   * 批量获取组件代码
   */
  async getComponents(dslId: string, componentNames: string[]): Promise<Record<string, string>> {
    const keys = componentNames.map(name => this.getComponentKey(dslId, name));
    const values = await this.redis.mget(...keys);
    
    const result: Record<string, string> = {};
    componentNames.forEach((name, index) => {
      if (values[index]) {
        result[name] = values[index]!;
      }
    });
    
    return result;
  }

  /**
   * 关闭Redis连接
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }

  // 私有方法 - 生成缓存键
  private getPageKey(dslId: string, pageId: string): string {
    return `${this.prefix}dsl:${dslId}:page:${pageId}`;
  }

  private getPageTimestampKey(dslId: string, pageId: string): string {
    return `${this.prefix}dsl:${dslId}:page:${pageId}:ts`;
  }

  private getRouterKey(dslId: string): string {
    return `${this.prefix}dsl:${dslId}:router`;
  }

  private getRouterTimestampKey(dslId: string): string {
    return `${this.prefix}dsl:${dslId}:router:ts`;
  }

  private getComponentKey(dslId: string, componentName: string): string {
    return `${this.prefix}dsl:${dslId}:component:${componentName}`;
  }

  private getMetaKey(dslId: string): string {
    return `${this.prefix}dsl:${dslId}:meta`;
  }
}
