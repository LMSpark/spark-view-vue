import { describe, it, expect } from 'vitest'
import { run, render, validate, createSandbox, Sandbox } from '../src/utils/sandbox'
import { Spark } from '../src/spark-namespace'

describe('Sandbox JS Execution', () => {
  describe('Direct API', () => {
    it('should evaluate simple expressions', () => {
      const result = run('1 + 2 * 3')
      expect(result).toBe(7)
    })

    it('should render templates', () => {
      const result = render('Hello {{name}}!', { name: 'World' })
      expect(result).toBe('Hello World!')
    })

    it('should validate safe code', () => {
      expect(() => validate('1 + 2')).not.toThrow()
    })

    it('should reject unsafe code', () => {
      expect(() => validate('eval("danger")')).toThrow('Unsafe code detected')
    })
  })

  describe('Sandbox instance', () => {
    it('should create custom sandbox', () => {
      const sandbox = createSandbox({ timeout: 1000 })
      expect(sandbox).toBeInstanceOf(Sandbox)
      const result = sandbox.run('1 + 1')
      expect(result).toBe(2)
    })

    it('should support reusable evaluators', () => {
      const sandbox = createSandbox()
      const add = sandbox.createEvaluator('a + b')
      expect(add({ a: 1, b: 2 })).toBe(3)
      expect(add({ a: 5, b: 10 })).toBe(15)
    })

    it('should support reusable renderers', () => {
      const sandbox = createSandbox()
      const greet = sandbox.createRenderer('Hi {{name}}!')
      expect(greet({ name: 'Alice' })).toBe('Hi Alice!')
      expect(greet({ name: 'Bob' })).toBe('Hi Bob!')
    })
  })

  describe('Spark namespace access', () => {
    it('should be accessible via Spark.run', () => {
      const result = Spark.run('2 + 3 * 4')
      expect(result).toBe(14)
    })

    it('should have render via Spark namespace', () => {
      const result = Spark.renderTemplate('Hello {{name}}!', { name: 'Spark' })
      expect(result).toBe('Hello Spark!')
    })

    it('should have validate via Spark namespace', () => {
      expect(() => Spark.validate('1 + 1')).not.toThrow()
    })

    it('should have sandbox factory via Spark namespace', () => {
      expect(typeof Spark.sandbox).toBe('function')
      const sandbox = Spark.sandbox()
      expect(sandbox).toBeInstanceOf(Sandbox)
    })
  })

  describe('Error handling', () => {
    it('should throw on invalid expressions', () => {
      expect(() => run('invalid syntax +++')).toThrow()
    })

    it('should throw on unsafe code', () => {
      expect(() => run('eval("danger")')).toThrow()
    })

    it('should handle context variables', () => {
      const result = run('a * b + c', { a: 2, b: 3, c: 5 })
      expect(result).toBe(11)
    })
  })
})