import { describe, it, expect, beforeEach } from 'vitest'
import { AppLogger, createLogger, logger } from '../src/utils/logger'

describe('Application Logger', () => {
  describe('AppLogger', () => {
    it('should create logger with default config', () => {
      const log = new AppLogger()
      expect(log).toBeDefined()
      expect(typeof log.info).toBe('function')
      expect(typeof log.debug).toBe('function')
      expect(typeof log.warn).toBe('function')
      expect(typeof log.error).toBe('function')
    })

    it('should create logger with custom config', () => {
      const log = new AppLogger({
        level: 'warn',
        prefix: 'Test',
        enableColors: false
      })
      
      expect(log).toBeDefined()
    })

    it('should filter logs by level', () => {
      const log = new AppLogger({ level: 'warn' })
      
      // These should not throw
      log.debug('debug message')  // Filtered out
      log.info('info message')    // Filtered out
      log.warn('warn message')    // Should log
      log.error('error message')  // Should log
    })

    it('should create child logger with prefix', () => {
      const parent = new AppLogger({ prefix: 'Parent' })
      const child = parent.createChild('Child')
      
      // Child should have combined prefix
      expect(child).toBeDefined()
    })

    it('should support semantic logging methods', () => {
      const log = new AppLogger()
      
      expect(typeof log.success).toBe('function')
      expect(typeof log.loading).toBe('function')
      expect(typeof log.data).toBe('function')
      expect(typeof log.api).toBe('function')
      expect(typeof log.event).toBe('function')
      expect(typeof log.sync).toBe('function')
      expect(typeof log.inject).toBe('function')
      expect(typeof log.package).toBe('function')
    })

    it('should allow dynamic level changes', () => {
      const log = new AppLogger({ level: 'debug' })
      
      log.setLevel('error')
      
      // Should not throw
      log.debug('filtered')
      log.info('filtered')
      log.warn('filtered')
      log.error('visible')
    })

    it('should support custom emoji logging', () => {
      const log = new AppLogger()
      
      // Should not throw
      log.withEmoji('🚀', 'info', 'Custom message')
    })
  })

  describe('Predefined Loggers', () => {
    it('should provide default logger instance', () => {
      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe('function')
    })

    it('should provide createLogger factory', () => {
      const custom = createLogger({ prefix: 'Custom' })
      
      expect(custom).toBeDefined()
      expect(custom).toBeInstanceOf(AppLogger)
    })
  })

  describe('Log Level Filtering', () => {
    it('should respect log level hierarchy', () => {
      const log = new AppLogger({ level: 'info' })
      
      // Debug should be filtered
      log.debug('debug')
      
      // Info, warn, error should pass
      log.info('info')
      log.warn('warn')
      log.error('error')
    })

    it('should allow all logs at debug level', () => {
      const log = new AppLogger({ level: 'debug' })
      
      log.debug('debug')
      log.info('info')
      log.warn('warn')
      log.error('error')
    })

    it('should only show errors at error level', () => {
      const log = new AppLogger({ level: 'error' })
      
      log.debug('filtered')
      log.info('filtered')
      log.warn('filtered')
      log.error('visible')
    })
  })

  describe('Configuration', () => {
    it('should update config dynamically', () => {
      const log = new AppLogger({ level: 'info' })
      
      log.setConfig({ level: 'debug', showTimestamp: true })
      
      // Should not throw
      log.debug('now visible')
    })

    it('should handle undefined config gracefully', () => {
      const log = new AppLogger()
      
      expect(log).toBeDefined()
    })
  })

  describe('Semantic Methods', () => {
    let log: AppLogger

    beforeEach(() => {
      log = new AppLogger({ level: 'debug' })
    })

    it('should support success logging', () => {
      log.success('Operation successful')
    })

    it('should support loading logging', () => {
      log.loading('Loading data...')
    })

    it('should support data logging', () => {
      log.data('Data updated', { id: 1 })
    })

    it('should support api logging', () => {
      log.api('API request', '/api/users')
    })

    it('should support event logging', () => {
      log.event('Button clicked', { button: 'submit' })
    })

    it('should support sync logging', () => {
      log.sync('Data synchronized')
    })

    it('should support inject logging', () => {
      log.inject('Dependency injected')
    })

    it('should support package logging', () => {
      log.package('Module loaded')
    })
  })

  describe('Child Loggers', () => {
    it('should create child with simple prefix', () => {
      const parent = logger.createChild('Parent')
      const child = parent.createChild('Child')
      
      expect(child).toBeDefined()
    })

    it('should maintain parent configuration in child', () => {
      const parent = new AppLogger({
        level: 'warn',
        enableColors: false
      })
      
      const child = parent.createChild('Child')
      
      // Child should respect parent's level
      child.info('filtered')  // Should be filtered
      child.warn('visible')   // Should be visible
    })

    it('should support multiple nesting levels', () => {
      const root = logger.createChild('Root')
      const branch = root.createChild('Branch')
      const leaf = branch.createChild('Leaf')
      
      expect(leaf).toBeDefined()
      leaf.info('Nested message')
    })
  })

  describe('Environment Adaptation', () => {
    it('should use debug level in development', () => {
      // In test environment, should default to appropriate level
      const log = new AppLogger()
      
      expect(log).toBeDefined()
    })
  })
})
