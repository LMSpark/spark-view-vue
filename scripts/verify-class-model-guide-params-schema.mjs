#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertClassModelGuideParamsSchema } from './lib/class-model-bundle-assert.mjs'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const bundleRoot = resolve(repoRoot, 'generated/dts-class-model')

assertClassModelGuideParamsSchema(bundleRoot)
console.log(`ClassModel guide paramsSchema gate passed: ${bundleRoot}`)
