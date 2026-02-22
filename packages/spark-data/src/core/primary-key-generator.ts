/**
 * 主键生成器 - 支持多种主键生成策略
 */

import type { IDataRow } from '../types'

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/**
 * 主键生成策略类型
 */
export type PrimaryKeyStrategy = 
  | 'auto-increment'    // 自增整数
  | 'uuid'              // UUID v4
  | 'snowflake'         // 雪花ID
  | 'timestamp'         // 时间戳
  | 'custom'            // 自定义生成器

/**
 * 主键生成器配置
 */
export interface PrimaryKeyGeneratorConfig {
  /** 生成策略 */
  strategy: PrimaryKeyStrategy
  /** 主键字段名（单主键）或字段名数组（复合主键） */
  fields: string | string[]
  /** 自定义生成函数（strategy='custom' 时必需） */
  generator?: (row: Partial<IDataRow>, existingRows: IDataRow[]) => string | number | Record<string, string | number>
  /** 雪花ID配置（strategy='snowflake' 时可选） */
  snowflake?: {
    /** 工作机器ID（0-31，默认0） */
    workerId?: number
    /** 数据中心ID（0-31，默认0） */
    datacenterId?: number
    /** 起始时间戳（默认 2020-01-01 00:00:00 UTC） */
    epoch?: number
  }
  /** 自增起始值（strategy='auto-increment' 时，默认1） */
  startValue?: number
}

// ─────────────────────────────────────────────
// 雪花ID生成器
// ─────────────────────────────────────────────

/**
 * 雪花ID生成器（64位整数，JavaScript 中使用字符串表示）
 * 
 * 结构（64位）：
 * - 1位：符号位（始终为0）
 * - 41位：时间戳（毫秒级，可用约69年）
 * - 5位：数据中心ID
 * - 5位：工作机器ID
 * - 12位：序列号（同一毫秒内递增）
 * 
 * 特点：
 * - 趋势递增（按时间排序）
 * - 分布式友好（不同机器不冲突）
 * - 高性能（单机每毫秒可生成4096个ID）
 */
class SnowflakeIdGenerator {
  private readonly epoch: number
  private readonly workerIdBits = 5n
  private readonly datacenterIdBits = 5n
  private readonly sequenceBits = 12n
  
  private readonly maxWorkerId = -1n ^ (-1n << this.workerIdBits)      // 31
  private readonly maxDatacenterId = -1n ^ (-1n << this.datacenterIdBits) // 31
  private readonly maxSequence = -1n ^ (-1n << this.sequenceBits)      // 4095
  
  private readonly workerIdShift = this.sequenceBits
  private readonly datacenterIdShift = this.sequenceBits + this.workerIdBits
  private readonly timestampShift = this.sequenceBits + this.workerIdBits + this.datacenterIdBits
  
  private workerId: bigint
  private datacenterId: bigint
  private sequence = 0n
  private lastTimestamp = -1n
  
  constructor(workerId: number = 0, datacenterId: number = 0, epoch?: number) {
    // 默认起始时间：2020-01-01 00:00:00 UTC
    this.epoch = epoch ?? new Date('2020-01-01T00:00:00.000Z').getTime()
    
    this.workerId = BigInt(workerId)
    this.datacenterId = BigInt(datacenterId)
    
    // 验证ID范围
    if (this.workerId < 0n || this.workerId > this.maxWorkerId) {
      throw new Error(`workerId 必须在 0-${this.maxWorkerId} 范围内`)
    }
    if (this.datacenterId < 0n || this.datacenterId > this.maxDatacenterId) {
      throw new Error(`datacenterId 必须在 0-${this.maxDatacenterId} 范围内`)
    }
  }
  
  /**
   * 生成下一个雪花ID
   * @returns 雪花ID（字符串形式的19位数字）
   */
  nextId(): string {
    let timestamp = BigInt(Date.now() - this.epoch)
    
    // 时钟回拨检测
    if (timestamp < this.lastTimestamp) {
      throw new Error(
        `时钟回拨检测：拒绝生成ID ${this.lastTimestamp - timestamp}ms`
      )
    }
    
    // 同一毫秒内
    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & this.maxSequence
      
      // 序列号溢出：等待下一毫秒
      if (this.sequence === 0n) {
        timestamp = this.waitNextMillis(this.lastTimestamp)
      }
    } else {
      // 新的毫秒：序列号重置
      this.sequence = 0n
    }
    
    this.lastTimestamp = timestamp
    
    // 组装ID
    const id = (timestamp << this.timestampShift) |
               (this.datacenterId << this.datacenterIdShift) |
               (this.workerId << this.workerIdShift) |
               this.sequence
    
    return id.toString()
  }
  
  /**
   * 等待到下一毫秒
   */
  private waitNextMillis(lastTimestamp: bigint): bigint {
    let timestamp = BigInt(Date.now() - this.epoch)
    while (timestamp <= lastTimestamp) {
      timestamp = BigInt(Date.now() - this.epoch)
    }
    return timestamp
  }
}

// ─────────────────────────────────────────────
// UUID 生成器
// ─────────────────────────────────────────────

/**
 * 生成 UUID v4
 * @returns UUID 字符串（格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx）
 */
function generateUUID(): string {
  // 使用 crypto.randomUUID() 如果可用（浏览器和 Node.js 15+）
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  
  // 回退方案：手动生成
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─────────────────────────────────────────────
// 主键生成器类
// ─────────────────────────────────────────────

/**
 * 主键生成器
 * 
 * 支持多种生成策略，可为新记录自动生成主键值
 */
export class PrimaryKeyGenerator {
  private config: PrimaryKeyGeneratorConfig
  private autoIncrementCounter: number
  private snowflakeGenerator?: SnowflakeIdGenerator
  
  constructor(config: PrimaryKeyGeneratorConfig) {
    this.config = config
    this.autoIncrementCounter = config.startValue ?? 1
    
    // 初始化雪花ID生成器
    if (config.strategy === 'snowflake') {
      const snowflakeConfig = config.snowflake ?? {}
      this.snowflakeGenerator = new SnowflakeIdGenerator(
        snowflakeConfig.workerId ?? 0,
        snowflakeConfig.datacenterId ?? 0,
        snowflakeConfig.epoch
      )
    }
  }
  
  /**
   * 为新记录生成主键值
   * 
   * @param row - 部分数据行（可能已包含部分字段值）
   * @param existingRows - 已存在的行数据（用于自增计算）
   * @returns 主键值或主键字段对象
   */
  generate(
    row: Partial<IDataRow>,
    existingRows: IDataRow[] = []
  ): string | number | Record<string, string | number> {
    const { fields } = this.config
    
    // 单主键
    if (typeof fields === 'string') {
      return this.generateSingle(row, existingRows, fields)
    }
    
    // 复合主键：为每个字段生成值
    const result: Record<string, string | number> = {}
    for (const field of fields) {
      result[field] = this.generateSingle(row, existingRows, field)
    }
    return result
  }
  
  /**
   * 生成单个字段的主键值
   */
  private generateSingle(
    row: Partial<IDataRow>,
    existingRows: IDataRow[],
    field: string
  ): string | number {
    const { strategy } = this.config
    
    switch (strategy) {
      case 'auto-increment':
        return this.generateAutoIncrement(existingRows, field)
      
      case 'uuid':
        return generateUUID()
      
      case 'snowflake':
        if (!this.snowflakeGenerator) {
          throw new Error('雪花ID生成器未初始化')
        }
        return this.snowflakeGenerator.nextId()
      
      case 'timestamp':
        return Date.now()
      
      case 'custom':
        if (!this.config.generator) {
          throw new Error('自定义生成器函数未提供')
        }
        const result = this.config.generator(row, existingRows)
        // 如果返回对象，提取对应字段
        if (typeof result === 'object' && result !== null) {
          return result[field] ?? this.autoIncrementCounter++
        }
        return result
      
      default:
        throw new Error(`不支持的主键生成策略: ${strategy}`)
    }
  }
  
  /**
   * 生成自增ID
   */
  private generateAutoIncrement(existingRows: IDataRow[], field: string): number {
    if (existingRows.length === 0) {
      const value = this.autoIncrementCounter
      this.autoIncrementCounter++
      return value
    }
    
    // 查找现有数据中的最大值
    let maxValue = this.autoIncrementCounter - 1
    for (const row of existingRows) {
      const value = row[field]
      if (typeof value === 'number' && value > maxValue) {
        maxValue = value
      }
    }
    
    // 返回最大值 + 1
    const nextValue = maxValue + 1
    this.autoIncrementCounter = nextValue + 1
    return nextValue
  }
  
  /**
   * 重置自增计数器
   */
  resetAutoIncrement(value: number): void {
    this.autoIncrementCounter = value
  }
  
  /**
   * 获取当前配置
   */
  getConfig(): Readonly<PrimaryKeyGeneratorConfig> {
    return { ...this.config }
  }
}

// ─────────────────────────────────────────────
// 导出工厂函数
// ─────────────────────────────────────────────

/**
 * 创建主键生成器
 */
export function createPrimaryKeyGenerator(
  config: PrimaryKeyGeneratorConfig
): PrimaryKeyGenerator {
  return new PrimaryKeyGenerator(config)
}

/**
 * 创建雪花ID生成器（独立使用）
 */
export function createSnowflakeGenerator(
  workerId: number = 0,
  datacenterId: number = 0,
  epoch?: number
): () => string {
  const generator = new SnowflakeIdGenerator(workerId, datacenterId, epoch)
  return () => generator.nextId()
}
