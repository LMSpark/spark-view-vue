import { describe, it, expect, vi } from 'vitest'
import {
  buildPageSystemPrompt,
  getSystemPrompt,
  detectRelevantSkillTypes,
  PAGE_SYSTEM_PROMPT,
  STILLS_RUNTIME_PROMPT,
  STILLS_BLUEPRINT_PROMPT,
} from '@spark-view/spark-ai'
import type {
  PromptBuildContext,
  ISkillMetadataProvider,
} from '@spark-view/spark-ai'

// ─────────────────────────────────────────────────────────────────────────────
// detectRelevantSkillTypes
// ─────────────────────────────────────────────────────────────────────────────

describe('detectRelevantSkillTypes', () => {
  it('空上下文返回空数组', () => {
    expect(detectRelevantSkillTypes()).toEqual([])
    expect(detectRelevantSkillTypes({})).toEqual([])
  })

  it('从 prompt 中检测 r-tree', () => {
    const ctx: PromptBuildContext = { prompt: '请帮我创建一个树容器来展示组织架构' }
    const types = detectRelevantSkillTypes(ctx)
    expect(types).toContain('r-tree')
  })

  it('从 prompt 中检测 r-form', () => {
    const ctx: PromptBuildContext = { prompt: '我需要一个编辑表单来修改用户信息' }
    const types = detectRelevantSkillTypes(ctx)
    expect(types).toContain('r-form')
  })

  it('从 prompt 中检测 r-detail', () => {
    const ctx: PromptBuildContext = { prompt: '做一个只读详情展示面板' }
    const types = detectRelevantSkillTypes(ctx)
    expect(types).toContain('r-detail')
  })

  it('从 prompt 中检测 r-table', () => {
    const ctx: PromptBuildContext = { prompt: '创建一个主从表来管理订单' }
    const types = detectRelevantSkillTypes(ctx)
    expect(types).toContain('r-table')
  })

  it('从 feedback 中检测', () => {
    const ctx: PromptBuildContext = { feedback: '表格容器缺少 dataKey 绑定' }
    const types = detectRelevantSkillTypes(ctx)
    expect(types).toContain('r-table')
  })

  it('从 currentFiles 中检测', () => {
    const ctx: PromptBuildContext = {
      currentFiles: { 'rule.json': '[{"type": "r-tree", "dataKey": "nodes@rows"}]' },
    }
    const types = detectRelevantSkillTypes(ctx)
    expect(types).toContain('r-tree')
  })

  it('从 logs 中检测', () => {
    const ctx: PromptBuildContext = {
      logs: [{ componentType: 'r-form', message: '表单容器渲染错误' }],
    }
    const types = detectRelevantSkillTypes(ctx)
    expect(types).toContain('r-form')
  })

  it('同时检测多个类型', () => {
    const ctx: PromptBuildContext = {
      prompt: '需要一个主从表页面，左侧分类树，右侧表格容器，点击行弹出编辑表单',
    }
    const types = detectRelevantSkillTypes(ctx)
    expect(types).toContain('r-tree')
    expect(types).toContain('r-table')
    expect(types).toContain('r-form')
  })

  it('关键词匹配不区分大小写', () => {
    const ctx: PromptBuildContext = { prompt: 'R-TREE component with NodeClick event' }
    const types = detectRelevantSkillTypes(ctx)
    expect(types).toContain('r-tree')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildPageSystemPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPageSystemPrompt', () => {
  it('无选项时返回基础 PAGE_SYSTEM_PROMPT', () => {
    const result = buildPageSystemPrompt()
    expect(result).toBe(PAGE_SYSTEM_PROMPT)
  })

  it('优先级 1：使用 metadataProvider index + 定向 skill', () => {
    const provider: ISkillMetadataProvider = {
      getSkillPromptIndex: vi.fn().mockReturnValue('## Skill Index\n- r-tree\n- r-table'),
      getSkillPromptForTypes: vi.fn().mockReturnValue('## r-tree 详情\n树容器使用说明'),
      getSkillPromptCompact: vi.fn().mockReturnValue('compact prompt'),
    }
    const result = buildPageSystemPrompt({
      metadataProvider: provider,
      context: { prompt: '创建一个分类树' },
    })

    expect(result).toContain(PAGE_SYSTEM_PROMPT)
    expect(result).toContain('## Skill Index')
    expect(result).toContain('## r-tree 详情')
    expect(provider.getSkillPromptIndex).toHaveBeenCalled()
    expect(provider.getSkillPromptForTypes).toHaveBeenCalledWith(
      expect.arrayContaining(['r-tree']),
    )
    // 优先级 1 命中后不应走 compact
    expect(provider.getSkillPromptCompact).not.toHaveBeenCalled()
  })

  it('优先级 2：index 为空时使用 compact', () => {
    const provider: ISkillMetadataProvider = {
      getSkillPromptIndex: vi.fn().mockReturnValue(null),
      getSkillPromptForTypes: vi.fn(),
      getSkillPromptCompact: vi.fn().mockReturnValue('## Compact Skill Catalog'),
    }
    const result = buildPageSystemPrompt({ metadataProvider: provider })

    expect(result).toContain(PAGE_SYSTEM_PROMPT)
    expect(result).toContain('## Compact Skill Catalog')
    expect(provider.getSkillPromptForTypes).not.toHaveBeenCalled()
  })

  it('provider 无数据时回落到基础 PAGE_SYSTEM_PROMPT', () => {
    const provider: ISkillMetadataProvider = {
      getSkillPromptIndex: vi.fn().mockReturnValue(null),
      getSkillPromptForTypes: vi.fn(),
      getSkillPromptCompact: vi.fn().mockReturnValue(null),
    }
    const result = buildPageSystemPrompt({
      metadataProvider: provider,
    })

    expect(result).toBe(PAGE_SYSTEM_PROMPT)
  })

  it('无 provider 时返回基础 PAGE_SYSTEM_PROMPT', () => {
    const result = buildPageSystemPrompt()
    expect(result).toBe(PAGE_SYSTEM_PROMPT)
  })

  it('index 有值但 forTypes 返回空时仅追加 index', () => {
    const provider: ISkillMetadataProvider = {
      getSkillPromptIndex: vi.fn().mockReturnValue('## Index Only'),
      getSkillPromptForTypes: vi.fn().mockReturnValue(null),
      getSkillPromptCompact: vi.fn(),
    }
    const result = buildPageSystemPrompt({ metadataProvider: provider })

    expect(result).toContain('## Index Only')
    expect(provider.getSkillPromptCompact).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getSystemPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('getSystemPrompt', () => {
  it('page 模式返回页面生成提示词', () => {
    const result = getSystemPrompt('page')
    expect(result).toBe(PAGE_SYSTEM_PROMPT)
  })

  it('stills 模式返回 Stills 运行时提示词', () => {
    const result = getSystemPrompt('stills')
    expect(result).toBe(STILLS_RUNTIME_PROMPT)
  })

  it('stills-blueprint 模式返回蓝图完整提示词', () => {
    const result = getSystemPrompt('stills-blueprint')
    expect(result).toBe(STILLS_BLUEPRINT_PROMPT)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 提示词内容完整性
// ─────────────────────────────────────────────────────────────────────────────

describe('提示词内容完整性', () => {
  it('PAGE_SYSTEM_PROMPT 包含必要章节', () => {
    expect(PAGE_SYSTEM_PROMPT).toContain('【0】输出协议')
    expect(PAGE_SYSTEM_PROMPT).toContain('【1】rule.json 规则')
    expect(PAGE_SYSTEM_PROMPT).toContain('【2】pagedata.json 规则')
    expect(PAGE_SYSTEM_PROMPT).toContain('【3】script.js 规则')
    expect(PAGE_SYSTEM_PROMPT).toContain('【4】style.css 规则')
    expect(PAGE_SYSTEM_PROMPT).toContain('【5】跨文件一致性')
    expect(PAGE_SYSTEM_PROMPT).toContain('【6】场景速记')
    expect(PAGE_SYSTEM_PROMPT).toContain('【7】高频错误速查')
  })

  it('STILLS_RUNTIME_PROMPT 包含业务逻辑层', () => {
    // L3 业务逻辑
    expect(STILLS_RUNTIME_PROMPT).toContain('L3: 业务逻辑')
    // L4 API 目录
    expect(STILLS_RUNTIME_PROMPT).toContain('L4: API 目录')
    expect(STILLS_RUNTIME_PROMPT).toContain('目录不是硬编码动作列表')
    expect(STILLS_RUNTIME_PROMPT).toContain('提示词只规定“先查再做”')
    expect(STILLS_RUNTIME_PROMPT).toContain('动作名、参数字段、参数类型、可选/必填、失败码，全部以查询结果为准')
    expect(STILLS_RUNTIME_PROMPT).not.toContain('datatable.create       — 全部表与列')
    // L5 按需查询
    expect(STILLS_RUNTIME_PROMPT).toContain('L5: 按需查询')
    expect(STILLS_RUNTIME_PROMPT).toContain('actionSpec')
    // 业务逻辑
    expect(STILLS_RUNTIME_PROMPT).toContain('蓝图编排')
    expect(STILLS_RUNTIME_PROMPT).toContain('效率纪律')
    expect(STILLS_RUNTIME_PROMPT).toContain('SPARK DataSet 核心概念')
  })

  it('STILLS_BLUEPRINT_PROMPT 包含 FC 交互规则与能力发现', () => {
    expect(STILLS_BLUEPRINT_PROMPT).toContain('Function Calling')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('交互规则')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('能力发现')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('session_describe')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('stills_capabilities')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('stills_actionSpec')
  })
})
