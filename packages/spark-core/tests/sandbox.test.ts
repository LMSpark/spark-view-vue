import { describe, it, expect } from 'vitest'
import { evaluateExpression } from '../src/utils/sandbox.js'

describe('Sandbox JS Execution', () => {
  describe('evaluateExpression', () => {
    it('should evaluate simple expressions', () => {
      const result = evaluateExpression('1 + 2 * 3')
      expect(result.success).toBe(true)
      expect(result.result).toBe(7)
    })
  })
})</content>
<parameter name="filePath">e:\spark-view\packages\spark-core\tests\sandbox.test.ts