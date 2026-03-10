#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function parseEnvFile(content) {
  const result = {}
  const lines = content.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const equalsIndex = line.indexOf('=')
    if (equalsIndex <= 0) {
      continue
    }

    const key = line.slice(0, equalsIndex).trim()
    const value = stripQuotes(line.slice(equalsIndex + 1).trim())
    if (!key) {
      continue
    }
    result[key] = value
  }

  return result
}

export function loadLocalJavaEnv(rootDir) {
  const candidates = [
    resolve(rootDir, '.env.java'),
    resolve(rootDir, 'spark-ai-server', '.env.java'),
  ]

  const loadedFiles = []
  const envFromFiles = {}

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue
    }

    const parsed = parseEnvFile(readFileSync(filePath, 'utf-8'))
    Object.assign(envFromFiles, parsed)
    loadedFiles.push(filePath)
  }

  return {
    loadedFiles,
    env: {
      ...envFromFiles,
      ...process.env,
    },
  }
}