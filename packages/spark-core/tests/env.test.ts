import { describe, it, expect, vi } from 'vitest'
import { getWindow, getDocument, isBrowser, isServer, getWindowProperty, getDocumentProperty } from '../src/utils/env'

describe('Environment Utils', () => {
  describe('Browser Environment', () => {
    it('should detect browser environment correctly', () => {
      expect(isBrowser()).toBe(true)
      expect(isServer()).toBe(false)
    })

    it('should return window object in browser', () => {
      expect(getWindow()).toBe(window)
    })

    it('should return document object in browser', () => {
      expect(getDocument()).toBe(document)
    })

    it('should access window properties safely', () => {
      expect(getWindowProperty('innerWidth', 0)).toBe(window.innerWidth)
      // Test with a property that might not exist in some environments
      expect(getWindowProperty('devicePixelRatio' as keyof Window, 1)).toBe(window.devicePixelRatio || 1)
    })

    it('should access document properties safely', () => {
      expect(getDocumentProperty('hidden', true)).toBe(document.hidden)
      // Test with a property that might not exist in some environments
      expect(getDocumentProperty('compatMode' as keyof Document, 'CSS1Compat')).toBe(document.compatMode || 'CSS1Compat')
    })
  })

  describe('Server Environment (Mock)', () => {
    const originalWindow = global.window
    const originalDocument = global.document

    beforeEach(() => {
      // Mock server environment
      delete (global as any).window
      delete (global as any).document
    })

    afterEach(() => {
      // Restore browser environment
      global.window = originalWindow
      global.document = originalDocument
    })

    it('should detect server environment correctly', () => {
      expect(isBrowser()).toBe(false)
      expect(isServer()).toBe(true)
    })

    it('should return undefined for window in server', () => {
      expect(getWindow()).toBeUndefined()
    })

    it('should return undefined for document in server', () => {
      expect(getDocument()).toBeUndefined()
    })

    it('should return default values when accessing properties in server', () => {
      expect(getWindowProperty('innerWidth', 1024)).toBe(1024)
      expect(getDocumentProperty('hidden', false)).toBe(false)
    })
  })
})