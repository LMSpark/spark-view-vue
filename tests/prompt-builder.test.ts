import { describe, it, expect, vi } from 'vitest'
import {
  buildPageSystemPrompt,
  getSystemPrompt,
  detectRelevantSkillTypes,
  PAGE_SYSTEM_PROMPT,
  SAP_SYSTEM_PROMPT,
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

  it('优先级 3：provider 无数据时使用 fallback skillCatalog', () => {
    const provider: ISkillMetadataProvider = {
      getSkillPromptIndex: vi.fn().mockReturnValue(null),
      getSkillPromptForTypes: vi.fn(),
      getSkillPromptCompact: vi.fn().mockReturnValue(null),
    }
    const result = buildPageSystemPrompt({
      metadataProvider: provider,
      skillCatalog: '## Fallback Catalog',
    })

    expect(result).toContain(PAGE_SYSTEM_PROMPT)
    expect(result).toContain('## Fallback Catalog')
  })

  it('无 provider 时直接使用 fallback skillCatalog', () => {
    const result = buildPageSystemPrompt({ skillCatalog: '## My Catalog' })
    expect(result).toContain(PAGE_SYSTEM_PROMPT)
    expect(result).toContain('## My Catalog')
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

  it('sap 模式返回 SAP 协议提示词', () => {
    const result = getSystemPrompt('sap')
    expect(result).toBe(SAP_SYSTEM_PROMPT)
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

  it('SAP_SYSTEM_PROMPT 包含中文协议说明', () => {
    expect(SAP_SYSTEM_PROMPT).toContain('SAP/1.0 协议驱动')
    expect(SAP_SYSTEM_PROMPT).toContain('@@request')
    expect(SAP_SYSTEM_PROMPT).toContain('自我修正')
    expect(SAP_SYSTEM_PROMPT).toContain('@@result')
  })

  it('STILLS_RUNTIME_PROMPT 包含完整五层架构', () => {
    // L1 协议
    expect(STILLS_RUNTIME_PROMPT).toContain('L1: SAP/1.0 协议')
    // L2 能力发现
    expect(STILLS_RUNTIME_PROMPT).toContain('L2: 能力发现')
    expect(STILLS_RUNTIME_PROMPT).toContain('stills.capabilities')
    expect(STILLS_RUNTIME_PROMPT).toContain('stills.actionSpec')
    // L3 业务逻辑
    expect(STILLS_RUNTIME_PROMPT).toContain('L3: 业务逻辑')
    expect(STILLS_RUNTIME_PROMPT).toContain('@@ui:confirm-questions')
    expect(STILLS_RUNTIME_PROMPT).toContain('蓝图编排')
    expect(STILLS_RUNTIME_PROMPT).toContain('效率纪律')
    expect(STILLS_RUNTIME_PROMPT).toContain('SPARK DataSet 核心概念')
    // L4 API 目录
    expect(STILLS_RUNTIME_PROMPT).toContain('L4: API 目录')
    expect(STILLS_RUNTIME_PROMPT).toContain('dataset.validate')
    // L5 按需查询
    expect(STILLS_RUNTIME_PROMPT).toContain('L5: 按需查询')
    expect(STILLS_RUNTIME_PROMPT).toContain('actionSpec')
  })

  it('STILLS_BLUEPRINT_PROMPT 包含五层架构', () => {
    expect(STILLS_BLUEPRINT_PROMPT).toContain('【1】SAP 协议层')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('【2】能力发现层')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('【3】蓝图工作流层')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('【4】执行纪律层')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('【5】底线')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('session.describe')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('stills.capabilities')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('七步工作流')
    expect(STILLS_BLUEPRINT_PROMPT).toContain('DataSet 建模蓝图推荐结构')
  })
})
