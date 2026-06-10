/**
 * L4 projectPlanning HR artifact assertions.
 *
 * Validates smoke/e2e JSON artifacts only — HR domain terms stay in scripts/.
 */

export const FORBIDDEN_PAGE_DESIGN_MARKERS = [
  'openPageDesign',
  'writePageFile',
  'setFileText',
  'getFileText',
  'editNodeTree',
  'editDataSet',
  'getNodeTree',
  'getDataSetTool',
]

/** HR 域覆盖主题；只在 scripts 配置，不进 spark-ai / VCM。 */
export const HR_COVERAGE_MATRIX = [
  { label: '组织架构', pattern: /组织|架构|org-structure|organization/iu },
  { label: '员工档案', pattern: /员工|档案|employee|personnel/iu },
  { label: '招聘入职', pattern: /招聘|入职|recruit|onboard/iu },
  { label: '合同', pattern: /合同|contract/iu },
  { label: '人事异动', pattern: /异动|调动|transfer/iu },
  { label: '考勤排班', pattern: /考勤|排班|attendance|shift/iu },
  { label: '请假加班', pattern: /请假|加班|leave|overtime/iu },
  { label: '薪酬社保', pattern: /薪酬|社保|payroll|compensation|salary/iu },
  { label: '公积金', pattern: /公积金|provident|housing-fund/iu },
  { label: '绩效培训', pattern: /绩效|培训|performance|training/iu },
  { label: '审批流', pattern: /审批|workflow|approval/iu },
  { label: '报表审计', pattern: /报表|审计|report|audit/iu },
]

const PLANNING_NODE_KINDS = new Set([
  'module',
  'page',
  'sub-page',
  'link',
  'system-page',
  'system-directory',
  'system-action',
  'ref',
])

const STABLE_ID_PATTERN = /^[a-z][a-z0-9_-]*$/iu

/**
 * @param {unknown} artifact
 * @param {Readonly<{
 *   minChildren?: number
 *   minCoverageRatio?: number
 *   requireNavigationRoot?: boolean
 * }>} [options]
 */
export function assertProjectPlanningHrArtifact(artifact, options = {}) {
  const minChildren = options.minChildren ?? 3
  const minCoverageRatio = options.minCoverageRatio ?? 0.7
  const requireNavigationRoot = options.requireNavigationRoot ?? true

  const findings = []
  const add = (level, check, message) => {
    findings.push({ level, check, message })
  }

  if (!isRecord(artifact)) {
    add('fail', 'artifact.shape', 'artifact must be a JSON object')
    return finalize(findings)
  }

  const result = artifact.result
  if (!isRecord(result)) {
    add('fail', 'artifact.result', 'artifact.result is required')
    return finalize(findings)
  }

  if (result.status !== 'completed') {
    add('fail', 'host-run.status', `expected completed, got ${String(result.status)}`)
    const errorMessage = readErrorMessage(result)
    if (errorMessage !== undefined) {
      add('info', 'host-run.error', errorMessage)
    }
    add('info', 'host-run.hint', 'fix L3 smoke before L4; run pnpm run verify:hr-sse-smoke-prereqs')
    return finalize(findings)
  }

  assertSmokePipelineChecks(result, findings)
  const navigationRoot = readNavigationRoot(result)
  if (navigationRoot === undefined) {
    if (requireNavigationRoot) {
      add(
        'fail',
        'navigation.root',
        'result.projectPlanning.navigationRoot missing; rerun smoke with --save-confirmed or ensure Host Run completed projectPlanning extras',
      )
    } else {
      add('warn', 'navigation.root', 'navigationRoot missing; skipped structural and HR coverage checks')
    }
    return finalize(findings)
  }

  assertNavigationContract(navigationRoot, minChildren, findings)
  assertHrCoverage(navigationRoot, minCoverageRatio, findings)
  assertNoPageDesignLeak(result, navigationRoot, findings)

  return finalize(findings)
}

function assertSmokePipelineChecks(result, findings) {
  const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : []
  if (toolCalls.length === 0) {
    addFinding(findings, 'fail', 'pipeline.toolCalls', 'completed without tool calls')
  } else {
    addFinding(findings, 'pass', 'pipeline.toolCalls', `${toolCalls.length} tool call(s)`)
  }
  const toolNames = toolCalls
    .map(call => isRecord(call) && typeof call.toolName === 'string' ? call.toolName : '')
    .filter(Boolean)
  if (!toolNames.includes('vcm_script')) {
    addFinding(findings, 'fail', 'pipeline.vcm_script', `missing vcm_script tool call; saw: ${toolNames.join(', ') || '(none)'}`)
  } else {
    addFinding(findings, 'pass', 'pipeline.vcm_script', 'observed')
  }

  const sseEvents = readStringArray(result, 'sseEvents')
  if (!sseEvents.includes('llm-frame')) {
    addFinding(findings, 'fail', 'pipeline.llm-frame', 'sseEvents missing llm-frame')
  } else {
    addFinding(findings, 'pass', 'pipeline.llm-frame', 'observed')
  }
}

function assertNavigationContract(root, minChildren, findings) {
  if (!isRecord(root)) {
    addFinding(findings, 'fail', 'navigation.shape', 'navigationRoot must be an object')
    return
  }

  const rootId = root.id
  if (typeof rootId !== 'string' || rootId.trim().length === 0) {
    addFinding(findings, 'fail', 'navigation.root.id', 'root id is required')
  }

  const rootKind = root.nodeKind
  if (rootKind !== 'module') {
    addFinding(findings, 'fail', 'navigation.root.nodeKind', `root must be module, got ${String(rootKind)}`)
  }

  const children = root.children
  if (!Array.isArray(children)) {
    addFinding(findings, 'fail', 'navigation.root.children', 'root.children must be an array')
    return
  }
  if (children.length < minChildren) {
    addFinding(
      findings,
      'fail',
      'navigation.root.children',
      `expected at least ${minChildren} top-level children, got ${children.length}`,
    )
  } else {
    addFinding(findings, 'pass', 'navigation.root.children', `${children.length} children`)
  }

  let pageCount = 0
  for (const node of walkNavigationNodes(root)) {
    const id = node.id
    if (typeof id !== 'string' || !STABLE_ID_PATTERN.test(id)) {
      addFinding(findings, 'fail', 'navigation.node.id', `unstable id: ${String(id)}`)
    }

    const title = node.title
    if (typeof title !== 'string' || title.trim().length === 0) {
      addFinding(findings, 'fail', 'navigation.node.title', `missing title on node ${String(id)}`)
    }

    const nodeKind = node.nodeKind
    if (typeof nodeKind !== 'string' || !PLANNING_NODE_KINDS.has(nodeKind)) {
      addFinding(findings, 'fail', 'navigation.node.nodeKind', `invalid nodeKind on ${String(id)}: ${String(nodeKind)}`)
    }

    if (nodeKind === 'page') {
      pageCount += 1
      const pagePath = node.path
      if (typeof pagePath !== 'string' || !pagePath.startsWith('/')) {
        addFinding(findings, 'fail', 'navigation.page.path', `page ${String(id)} path must start with /`)
      }
      const description = readNodeDescription(node)
      if (description.length < 8) {
        addFinding(findings, 'warn', 'navigation.page.description', `page ${String(id)} planning summary is short`)
      }
    }
  }

  if (pageCount === 0) {
    addFinding(findings, 'fail', 'navigation.page.count', 'expected at least one page node')
  } else {
    addFinding(findings, 'pass', 'navigation.page.count', `${pageCount} page node(s)`)
  }
}

function assertHrCoverage(root, minCoverageRatio, findings) {
  const blob = JSON.stringify(walkNavigationNodes(root))
  const matched = []
  const missing = []
  for (const topic of HR_COVERAGE_MATRIX) {
    if (topic.pattern.test(blob)) matched.push(topic.label)
    else missing.push(topic.label)
  }

  const ratio = matched.length / HR_COVERAGE_MATRIX.length
  addFinding(
    findings,
    'info',
    'hr.coverage.matched',
    `${matched.length}/${HR_COVERAGE_MATRIX.length}: ${matched.join(', ') || '(none)'}`,
  )

  if (ratio < minCoverageRatio) {
    addFinding(
      findings,
      'fail',
      'hr.coverage.ratio',
      `coverage ${(ratio * 100).toFixed(0)}% < ${(minCoverageRatio * 100).toFixed(0)}%; missing: ${missing.join(', ')}`,
    )
  } else {
    addFinding(
      findings,
      'pass',
      'hr.coverage.ratio',
      `coverage ${(ratio * 100).toFixed(0)}% (threshold ${(minCoverageRatio * 100).toFixed(0)}%)`,
    )
  }
}

function assertNoPageDesignLeak(result, navigationRoot, findings) {
  const serialized = JSON.stringify(readExecutionSurface(result, navigationRoot))
  const forbidden = FORBIDDEN_PAGE_DESIGN_MARKERS.filter(marker => serialized.includes(marker))
  if (forbidden.length > 0) {
    addFinding(findings, 'fail', 'stage.pageDesign', `forbidden markers: ${forbidden.join(', ')}`)
  } else {
    addFinding(findings, 'pass', 'stage.pageDesign', 'no pageDesign markers in artifact navigation')
  }
}

function readExecutionSurface(result, navigationRoot) {
  const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : []
  return {
    text: typeof result.text === 'string' ? result.text : '',
    toolCalls: toolCalls.map(call => ({
      toolName: isRecord(call) && typeof call.toolName === 'string' ? call.toolName : '',
      argsPreview: isRecord(call) && typeof call.argsPreview === 'string' ? call.argsPreview : '',
    })),
    navigationRoot,
  }
}

/**
 * @param {unknown} root
 * @returns {Array<Record<string, unknown>>}
 */
export function walkNavigationNodes(root) {
  if (!isRecord(root)) return []
  const out = [root]
  const children = root.children
  if (!Array.isArray(children)) return out
  for (const child of children) {
    if (!isRecord(child)) continue
    out.push(...walkNavigationNodes(child))
  }
  return out
}

function readNavigationRoot(result) {
  const projectPlanning = result.projectPlanning
  if (isRecord(projectPlanning) && projectPlanning.navigationRoot !== undefined) {
    return projectPlanning.navigationRoot
  }
  if (result.navigationRoot !== undefined) return result.navigationRoot
  return undefined
}

function readNodeDescription(node) {
  if (typeof node.description === 'string') return node.description.trim()
  if (typeof node.title === 'string') return node.title.trim()
  return ''
}

function readErrorMessage(result) {
  const error = result.error
  if (!isRecord(error)) return undefined
  return typeof error.message === 'string' ? error.message : undefined
}

function readStringArray(record, field) {
  const value = record[field]
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function addFinding(findings, level, check, message) {
  findings.push({ level, check, message })
}

function finalize(findings) {
  const failed = findings.some(item => item.level === 'fail')
  return {
    ok: !failed,
    findings,
    summary: {
      pass: findings.filter(item => item.level === 'pass').length,
      warn: findings.filter(item => item.level === 'warn').length,
      fail: findings.filter(item => item.level === 'fail').length,
      info: findings.filter(item => item.level === 'info').length,
    },
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
