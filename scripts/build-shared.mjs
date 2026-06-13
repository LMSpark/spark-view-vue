#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLocalJavaEnv } from './load-java-env.mjs'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))

export const ROOT_DIR = resolve(SCRIPT_DIR, '..')
export const SERVER_DIR = resolve(ROOT_DIR, 'spark-ai-server')
export const COMPOSE_FILE = resolve(SERVER_DIR, 'docker-compose.yml')
export const PACKAGES_DIR_NAME = 'packages'
export const PACKAGES_DIR = resolve(ROOT_DIR, PACKAGES_DIR_NAME)

const JAVA_HOME_CANDIDATES = [
  'C:\\Program Files\\Microsoft\\jdk-17.0.16.8-hotspot',
  'C:\\Program Files\\Eclipse Adoptium\\jdk-17',
  'C:\\Program Files\\Java\\jdk-17',
]

export function resolveJavaHome(env = process.env) {
  const candidates = [
    env.JAVA_HOME,
    ...JAVA_HOME_CANDIDATES,
  ]
  return candidates.find((home) => (
    home && existsSync(resolve(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))
  ))
}

export function loadMergedEnv() {
  return loadLocalJavaEnv(ROOT_DIR)
}

export function buildJavaProcessEnv(javaHome, mergedEnv) {
  const existingPath = mergedEnv.PATH ?? mergedEnv.Path ?? process.env.PATH ?? process.env.Path ?? ''
  return {
    ...mergedEnv,
    JAVA_HOME: javaHome,
    PATH: `${resolve(javaHome, 'bin')}${process.platform === 'win32' ? ';' : ':'}${existingPath}`,
  }
}

export function runCommand(cmd, options = {}) {
  const cwd = options.cwd ?? ROOT_DIR
  const env = options.env ?? process.env
  const stdio = options.stdio ?? 'inherit'
  if (options.log !== false) {
    console.log(`\n> ${cmd}\n`)
  }
  execSync(cmd, { cwd, env, stdio })
}

export function mvnCommand() {
  return process.platform === 'win32' ? 'mvn.cmd' : 'mvn'
}
