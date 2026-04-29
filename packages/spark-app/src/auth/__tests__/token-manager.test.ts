/**
 * TokenManager 测试
 *
 * 覆盖：
 * - memory 模式（测试环境默认走 memory）
 * - set / get / clear 完整生命周期
 * - 自定义 tokenKey
 * - 初始 getToken 返回 null
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { TokenManager } from '../TokenManager'

describe('TokenManager', () => {
  // 在 vitest jsdom 环境中，envAdapter 检测到 isTest=true，
  // 因此无论 storage 参数为何值，getToken/setToken/clearToken 均走内存路径。

  let tm: TokenManager

  beforeEach(() => {
    tm = new TokenManager('memory', 'test_token')
  })

  it('初始无 token → 返回 null', () => {
    expect(tm.getToken()).toBeNull()
  })

  it('setToken → getToken 返回相同值', () => {
    tm.setToken('abc123')
    expect(tm.getToken()).toBe('abc123')
  })

  it('clearToken 后返回 null', () => {
    tm.setToken('abc123')
    tm.clearToken()
    expect(tm.getToken()).toBeNull()
  })

  it('多次 setToken 取最后一次', () => {
    tm.setToken('first')
    tm.setToken('second')
    expect(tm.getToken()).toBe('second')
  })

  it('自定义 tokenKey 互不干扰', () => {
    const tm1 = new TokenManager('memory', 'key_a')
    const tm2 = new TokenManager('memory', 'key_b')

    tm1.setToken('val_a')
    tm2.setToken('val_b')

    expect(tm1.getToken()).toBe('val_a')
    expect(tm2.getToken()).toBe('val_b')
  })

  it('默认参数 — localStorage + spark_token', () => {
    // 不抛错即可；测试环境 isTest=true → 走 memory
    const def = new TokenManager()
    def.setToken('hello')
    expect(def.getToken()).toBe('hello')
    def.clearToken()
    expect(def.getToken()).toBeNull()
  })
})
