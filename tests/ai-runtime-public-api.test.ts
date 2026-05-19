import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as SparkAi from '../packages/spark-ai/src'
import * as SparkAiHost from '@spark-view/spark-ai/host'

const CONSUMER_SOURCE_ROOTS = [
  'packages/spark-ai/src/registrations',
  'src/services/app-ai',
] as const

const RUNTIME_BACKED_MODULE_FILES = [
  'packages/spark-ai/src/registrations/page-design/page-design-module.ts',
  'packages/spark-ai/src/registrations/leave-request/leave-request-module.ts',
] as const

const LEGACY_REGISTRATION_SOURCE_RE = /\bI(?:ModuleRegistration|BusinessRegistration|BusinessRegistrationData|BusinessRegistrationStoreSnapshot)\b|\bAiRegisteredBusinessApi\b|\bregisterBusiness\s*\(|from\s+['"](?:\.\.\/)+(?:index|core|core\/host)?['"]|from\s+['"]@spark-view\/spark-ai['"]|new\s*\(\s*class\s+extends/
const LEGACY_FUNCTIONS_READ_RE = /\.functions\b/

function collectSourceFiles(root: string): string[] {
  const files: string[] = []
  for (const item of readdirSync(root)) {
    const path = join(root, item)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(path))
      continue
    }
    if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      files.push(path)
    }
  }
  return files
}

function legacyRegistrationSourceViolations(): string[] {
  return CONSUMER_SOURCE_ROOTS
    .flatMap((root) => collectSourceFiles(join(process.cwd(), root)))
    .flatMap((file) => {
      const content = readFileSync(file, 'utf8')
      return content.split(/\r?\n/).flatMap((line, index) => (
        LEGACY_REGISTRATION_SOURCE_RE.test(line)
          ? [`${relative(process.cwd(), file)}:${index + 1}`]
          : []
      ))
    })
}

function legacyFunctionsReadViolations(): string[] {
  return RUNTIME_BACKED_MODULE_FILES.flatMap((file) => {
    const absoluteFile = join(process.cwd(), file)
    const content = readFileSync(absoluteFile, 'utf8')
    return content.split(/\r?\n/).flatMap((line, index) => (
      LEGACY_FUNCTIONS_READ_RE.test(line)
        ? [`${relative(process.cwd(), absoluteFile)}:${index + 1}`]
        : []
    ))
  })
}

describe('ai runtime class-only public surface', () => {
  it('exposes class-first runtime only', () => {
    expect('createAiRuntime' in SparkAi).toBe(false)

    expect(typeof SparkAi.AiRuntime).toBe('function')
    expect('PageDesignBusiness' in SparkAi).toBe(false)
    expect(typeof SparkAi.PageDesignModule).toBe('function')
    expect(typeof SparkAi.LeaveRequestModule).toBe('function')
    expect(typeof SparkAi.LifecycleModule).toBe('function')
    expect(typeof SparkAiHost.AiHostBusinessRegistry).toBe('function')
  })

  it('keeps class-first registrations compatible with legacy function reads', () => {
    const lifecycle = new SparkAi.LifecycleModule()
    const leaveRegistration = new SparkAi.LeaveRequestModuleRegistration()
    const leaveModule = new SparkAi.LeaveRequestModule()
    const pageDesignModule = new SparkAi.PageDesignModule({
      getEditToolHost: () => {
        throw new Error('not needed')
      },
    })

    expect(lifecycle.getFunctions()).toBe(lifecycle.functions)
    expect(lifecycle.functions.length).toBeGreaterThan(0)
    expect(lifecycle.entity).toEqual({})

    expect(leaveRegistration.getFunctions()).toBe(leaveRegistration.functions)
    expect(leaveRegistration.functions.length).toBeGreaterThan(0)

    expect(leaveModule.businessId).toBe('manualLeave')
    expect(leaveModule.entity).toEqual({})
    expect(leaveModule.getFunctions()).toBe(leaveModule.functions)
    expect(pageDesignModule.getFunctions()).toBe(pageDesignModule.functions)
    expect(pageDesignModule.functions).toEqual([])
    expect(leaveModule.getRegistrationData()).toMatchObject({
      moduleId: 'manualLeave',
      description: '帮助员工收集、确认并提交人工请假申请。',
      prompt: expect.stringContaining('你正在处理人工请假业务'),
      functions: expect.any(Array),
    })
    expect(leaveModule.getBusinessRegistrationData()).toMatchObject({
      businessId: 'manualLeave',
      description: '帮助员工收集、确认并提交人工请假申请。',
      functions: expect.any(Array),
    })
    expect(leaveModule.getRegistrationStoreSnapshot()).toMatchObject({
      rootModulePath: 'manualLeave',
    })
    expect(leaveModule.getBusinessRegistrationStoreSnapshot()).toMatchObject({
      rootBusinessPath: 'manualLeave',
      rootModulePath: 'manualLeave',
    })
  })

  it('keeps legacy business registration entrypoint available on core only', () => {
    const core = new SparkAi.AiRuntime()
    const api = core.registerBusiness({
      moduleId: 'legacyBusiness',
      businessId: 'legacyBusiness',
      name: 'Legacy business',
      entity: {},
      prompt: 'Legacy prompt.',
      functions: [],
    })

    expect(api.businessId).toBe('legacyBusiness')
    expect(api.getBusinessRegistrationData()).toMatchObject({
      businessId: 'legacyBusiness',
      prompt: 'Legacy prompt.',
    })
    expect(api.getBusinessRegistrationStoreSnapshot()).toMatchObject({
      rootBusinessPath: 'legacyBusiness',
      rootModulePath: 'legacyBusiness',
    })
  })

  it('keeps consumer registrations off legacy registration contracts and entrypoints', () => {
    expect(legacyRegistrationSourceViolations()).toEqual([])
  })

  it('keeps runtime-backed modules on getFunctions as the primary function path', () => {
    expect(legacyFunctionsReadViolations()).toEqual([])
  })
})
