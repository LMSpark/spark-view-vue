/**
 * 缓存管理器
 * 支持内存缓存，可扩展为 Redis/CDN
 */

export interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * 内存缓存实现
 * 注意：生产环境建议使用 Redis 或其他分布式缓存
 */
export class MemoryCache implements CacheAdapter {
  private cache = new Map<string, { value: string; expireAt?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (entry.expireAt && Date.now() > entry.expireAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const entry: { value: string; expireAt?: number } = { value };

    if (ttl) {
      entry.expireAt = Date.now() + ttl * 1000;
    }

    this.cache.set(key, entry);
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

/**
 * Redis 缓存适配器（示例）
 * 需要安装 ioredis: pnpm add ioredis
 */
/*
import Redis from 'ioredis';

export class RedisCache implements CacheAdapter {
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async clear(): Promise<void> {
    await this.client.flushdb();
  }
}
*/
