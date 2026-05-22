import { describe, it, expect } from 'vitest'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-page-config/page/app-services'
import type { CapabilityContext } from '@spark-view/spark-component'
import type { LoggerApi } from '@spark-view/spark-utils'
import { createPageRuntimeServices, readPageRuntimeServices } from './logger-test-helpers'

describe('page-level logger capability', () => {
  it('stores logger under PAGE_RUNTIME_SERVICES payload', () => {
    let called = false
    const loggerImpl: LoggerApi = {
      info: (..._args: unknown[]) => { called = true },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: CapabilityContext = {
      id: 'ctx-logger',
      type: 'test',
      capabilities: new Map([[PAGE_RUNTIME_SERVICES, createPageRuntimeServices(loggerImpl)]])
    }

    const pageRuntimeServices = readPageRuntimeServices(ctx)
    pageRuntimeServices.logger.info('test')

    expect(called).toBe(true)
  })

  it('keeps router and logger together in the same page payload', async () => {
    let calledLocal = false
    const loggerImpl: LoggerApi = {
      info: (..._args: unknown[]) => { calledLocal = true },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: CapabilityContext = {
      id: 'ctx-1',
      type: 'test',
      capabilities: new Map([[PAGE_RUNTIME_SERVICES, createPageRuntimeServices(loggerImpl)]])
    }

    const pageRuntimeServices = readPageRuntimeServices(ctx)
    await pageRuntimeServices.router.push('/orders')
    pageRuntimeServices.logger.info('hello')

    expect(calledLocal).toBe(true)
  })
})
