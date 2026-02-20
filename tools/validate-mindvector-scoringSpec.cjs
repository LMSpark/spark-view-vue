const fs = require('fs')

const BIB_PATH = 'docs\\MindVector\\bib.json'

function parseArgs(argv) {
  const out = { configPath: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--config') {
      out.configPath = argv[i + 1] || null
      i++
    }
  }
  return out
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function getDeep(obj, dottedKey) {
  if (!isPlainObject(obj)) return { exists: false, value: undefined }
  const parts = String(dottedKey || '').split('.').filter(Boolean)
  let cur = obj
  for (const p of parts) {
    if (!isPlainObject(cur) && !Array.isArray(cur)) return { exists: false, value: undefined }
    if (!(p in cur)) return { exists: false, value: undefined }
    cur = cur[p]
  }
  return { exists: true, value: cur }
}

function collectParameterKeys(obj, out) {
  if (!isPlainObject(obj)) return
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out.add(v)
    else if (v == null) out.add(`__NULL__:${k}`)
    else if (isPlainObject(v)) {
      // 某些地方可能错误地把对象塞进 parametersRequired；记录为告警
      out.add(`__OBJECT__:${k}`)
    }
  }
}

function collectRequiredConfigKeys(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectRequiredConfigKeys(item, out)
    return
  }
  if (!isPlainObject(node)) return

  for (const [k, v] of Object.entries(node)) {
    if (k.endsWith('KeyRequired') && typeof v === 'string') {
      out.add(v.trim())
      continue
    }
    if (k === 'parametersRequired' && isPlainObject(v)) {
      for (const val of Object.values(v)) {
        if (typeof val === 'string' && val.trim()) out.add(val.trim())
      }
    }
    collectRequiredConfigKeys(v, out)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const text = fs.readFileSync(BIB_PATH, 'utf8')
  const root = JSON.parse(text)
  if (!Array.isArray(root.tasks)) throw new Error('root.tasks missing or not an array')

  let configRoot = null
  if (args.configPath) {
    const cfgText = fs.readFileSync(args.configPath, 'utf8')
    const cfgJson = JSON.parse(cfgText)
    // 支持两种格式：{config:{...}}（模板）或直接 {...}
    configRoot = isPlainObject(cfgJson?.config) ? cfgJson.config : cfgJson
  }

  const errors = []
  const warnings = []
  const parameterKeys = new Set()
  const requiredConfigKeys = new Set()
  const methodTypes = new Map()
  let behavioralCompositeCount = 0

  for (const task of root.tasks) {
    const id = String(task?.taskId ?? '')
    const spec = task?.scoringSpec
    if (!spec) {
      errors.push(`${id}: missing scoringSpec`)
      continue
    }

    if (!spec.version) warnings.push(`${id}: scoringSpec.version missing`)

    const method = spec.scoringMethod
    if (!method || !isPlainObject(method)) {
      errors.push(`${id}: scoringMethod missing or not object`)
      continue
    }

    if (!Array.isArray(method.requiredSignals) || method.requiredSignals.length === 0) {
      errors.push(`${id}: requiredSignals missing/empty`)
    }

    if (!Array.isArray(method.computations) || method.computations.length === 0) {
      errors.push(`${id}: computations missing/empty`)
    } else {
      for (const comp of method.computations) {
        if (comp?.kind === 'behavioralComposite') behavioralCompositeCount++
        if (isPlainObject(comp?.parametersRequired)) collectParameterKeys(comp.parametersRequired, parameterKeys)
        if (isPlainObject(comp?.parametersRequired?.parametersRequired)) {
          warnings.push(`${id}: nested parametersRequired found`)
        }
      }
    }

    // 汇总“实现侧必须提供”的配置 key
    collectRequiredConfigKeys(spec, requiredConfigKeys)

    if (isPlainObject(method.parametersRequired)) collectParameterKeys(method.parametersRequired, parameterKeys)

    const type = String(method.type || '')
    methodTypes.set(type, (methodTypes.get(type) ?? 0) + 1)

    // 简单结构检查：outputs
    if (!Array.isArray(spec.scoringOutputs) || spec.scoringOutputs.length === 0) {
      warnings.push(`${id}: scoringOutputs missing/empty`)
    }
  }

  if (behavioralCompositeCount > 0) {
    errors.push(`behavioralComposite still present: ${behavioralCompositeCount}`)
  }

  if (configRoot) {
    let missing = 0
    let nullValues = 0
    let emptyObjectValues = 0
    let emptyArrayValues = 0

    for (const key of [...requiredConfigKeys].sort((a, b) => a.localeCompare(b))) {
      const { exists, value } = getDeep(configRoot, key)
      if (!exists) {
        missing++
        errors.push(`config missing key: ${key}`)
        continue
      }
      if (value === null) {
        nullValues++
        errors.push(`config key is null: ${key}`)
      } else if (isPlainObject(value) && Object.keys(value).length === 0) {
        emptyObjectValues++
      } else if (Array.isArray(value) && value.length === 0) {
        emptyArrayValues++
      }
    }

    console.log(`\nConfig check (${args.configPath}):`)
    console.log(`  required keys: ${requiredConfigKeys.size}`)
    console.log(`  missing: ${missing}`)
    console.log(`  null values: ${nullValues}`)
    console.log(`  empty objects: ${emptyObjectValues} (warning-only)`)
    console.log(`  empty arrays: ${emptyArrayValues} (warning-only)`)
  }

  // 参数 key 统计
  const nullParams = [...parameterKeys].filter((k) => k.startsWith('__NULL__:'))
  const objectParams = [...parameterKeys].filter((k) => k.startsWith('__OBJECT__:'))

  for (const p of nullParams) warnings.push(`parametersRequired contains null: ${p}`)
  for (const p of objectParams) warnings.push(`parametersRequired contains object: ${p}`)

  const cleanKeys = [...parameterKeys].filter((k) => !k.startsWith('__'))
  const byPrefix = new Map()
  for (const key of cleanKeys) {
    const prefix = key.split('.')[0]
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1)
  }

  // 输出
  const sortMap = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])

  console.log(`Tasks: ${root.tasks.length}`)
  console.log('scoringMethod.type counts (top 20):')
  for (const [k, v] of sortMap(methodTypes).slice(0, 20)) console.log(`  ${k || '<empty>'}: ${v}`)

  console.log('parametersRequired key prefixes:')
  for (const [k, v] of sortMap(byPrefix)) console.log(`  ${k}: ${v}`)

  if (warnings.length) {
    console.log('\nWarnings:')
    for (const w of warnings) console.log(`- ${w}`)
  }

  if (errors.length) {
    console.error('\nErrors:')
    for (const e of errors) console.error(`- ${e}`)
    process.exitCode = 1
  } else {
    console.log('\nOK')
  }
}

main()
