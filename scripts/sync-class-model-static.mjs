#!/usr/bin/env node

import { syncClassModelStaticBundle } from './lib/sync-class-model-static.mjs'

const result = syncClassModelStaticBundle()
console.log(`Synced ClassModel bundle → ${result.targetDir}`)
