import { describe, expect, it, vi } from 'vitest'

import {
  createFunctionRuntimeContext,
  createMethodBackedDefinitions,
  type FunctionCatalogRow,
} from '../packages/spark-ai/src'

interface TestRow extends FunctionCatalogRow {
  method: string
  type?: 'describe' | 'request'
}

function createRow(overrides: Partial<TestRow> = {}): TestRow {
  return {
    action: 'pageDesign@test@doThing',
    type: 'request',
    description: 'test method-backed dispatch',
    paramsSchema: { value: 'number' },
    resultSchema: { ok: 'boolean' },
    example: { value: 1 },
    usageRules: ['value must be provided'],
    failureModes: [],
    method: 'doThing',
    ...overrides,
  }
}

function createDefinition<TCarrier, TTarget>(options: {
  carrier: TCarrier
  row?: TestRow
  resolveTarget: (carrier: TCarrier, row: TestRow) => TTarget | null
  validate?: (row: TestRow, params: unknown) => string | null
  missingTarget?: (row: TestRow) => { ok: false; code: string; msg: string; fix: string }
  missingMethod?: (row: TestRow, methodName: string) => { ok: false; code: string; msg: string; fix: string }
  executeError?: (row: TestRow, errorMessage: string) => { ok: false; code: string; msg: string; fix: string }
  summary?: (row: TestRow) => string
  afterRequest?: (carrier: TCarrier, target: TTarget, row: TestRow) => void
}) {
  const [definition] = createMethodBackedDefinitions({
    rows: [options.row ?? createRow()],
    modulePrompt: 'test module prompt',
    resolveTarget: options.resolveTarget,
    methodName: (row) => row.method,
    validate: options.validate ?? (() => null),
    missingTarget: options.missingTarget ?? (() => ({
      ok: false,
      code: 'NO_TARGET',
      msg: 'target missing',
      fix: 'bind target first',
    })),
    missingMethod: options.missingMethod,
    executeError: options.executeError,
    summary: options.summary,
    afterRequest: options.afterRequest,
  })

  if (definition === undefined) {
    throw new Error('expected one definition')
  }

  return definition
}

function executeWithCarrier<TCarrier>(definition: ReturnType<typeof createDefinition<TCarrier, unknown>>, carrier: TCarrier, params: unknown) {
  if (!definition.executeWithCarrier) {
    throw new Error('expected executeWithCarrier')
  }
  return definition.executeWithCarrier(createFunctionRuntimeContext(), carrier, params)
}

describe('core method-backed definition builder', () => {
  it('forwards validate and returns missingTarget when target cannot be resolved', () => {
    const row = createRow()
    const validate = vi.fn(() => 'INVALID')
    const definition = createDefinition({
      carrier: { session: 's1' },
      row,
      resolveTarget: () => null,
      validate,
    })

    expect(definition.validate({ value: 1 })).toBe('INVALID')
    expect(validate).toHaveBeenCalledWith(row, { value: 1 })

    const result = executeWithCarrier(definition, { session: 's1' }, { value: 1 })
    expect(result).toEqual({
      ok: false,
      code: 'NO_TARGET',
      msg: 'target missing',
      fix: 'bind target first',
    })
  })

  it('invokes the target method and runs afterRequest for request rows', () => {
    const state = { writes: 0 }
    const row = createRow()
    const afterRequest = vi.fn((currentState: typeof state) => {
      currentState.writes += 1
    })
    const target = {
      calls: [] as unknown[],
      doThing(payload: unknown) {
        this.calls.push(payload)
        return { accepted: true, payload }
      },
    }

    const definition = createDefinition({
      carrier: state,
      row,
      resolveTarget: () => target,
      summary: () => 'custom summary',
      afterRequest,
    })

    const result = executeWithCarrier(definition, state, { value: 2 })

    expect(result).toEqual({
      ok: true,
      data: { accepted: true, payload: { value: 2 } },
      summary: 'custom summary',
    })
    expect(target.calls).toEqual([{ value: 2 }])
    expect(afterRequest).toHaveBeenCalledWith(state, target, row)
    expect(state.writes).toBe(1)
  })

  it('returns default METHOD_NOT_FOUND guidance when the resolved target lacks the named method', () => {
    const definition = createDefinition({
      carrier: { session: 's2' },
      row: createRow(),
      resolveTarget: () => ({}),
    })

    const result = executeWithCarrier(definition, { session: 's2' }, { value: 3 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('METHOD_NOT_FOUND')
    expect(result.msg).toContain('method "doThing" not found on target')
    expect(result.fix).toContain('参数格式')
    expect(result.fix).toContain('示例')
    expect(result.fix).toContain('关键规则')
  })

  it('maps thrown method errors to EXECUTE_ERROR with default fix guidance', () => {
    const target = {
      doThing() {
        throw new Error('boom')
      },
    }

    const definition = createDefinition({
      carrier: { session: 's3' },
      row: createRow(),
      resolveTarget: () => target,
    })

    const result = executeWithCarrier(definition, { session: 's3' }, { value: 4 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('EXECUTE_ERROR')
    expect(result.msg).toBe('boom')
    expect(result.fix).toContain('参数格式')
    expect(result.fix).toContain('示例')
    expect(result.fix).toContain('关键规则')
  })
})
