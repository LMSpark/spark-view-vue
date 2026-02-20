const fs = require('fs')

const BIB_PATH = 'docs\\MindVector\\bib.json'

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))]
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function guessRangeFromText(text) {
  if (!text || typeof text !== 'string') return null

  const patterns = [
    { re: /-1\s*到\s*\+?1/, range: { min: -1, max: 1 } },
    { re: /0\s*[-到]\s*1/, range: { min: 0, max: 1 } },
    { re: /0\s*[-到]\s*100/, range: { min: 0, max: 100 } },
    { re: /1\s*[-到]\s*7/, range: { min: 1, max: 7 } },
    { re: /1\s*[-到]\s*5/, range: { min: 1, max: 5 } },
  ]

  for (const p of patterns) {
    if (p.re.test(text)) return p.range
  }
  return null
}

function clampRange(range) {
  if (!range) return null
  if (typeof range.min !== 'number' || typeof range.max !== 'number') return null
  return { min: range.min, max: range.max }
}

function pickRangeFromScenario(scenario) {
  if (!scenario || typeof scenario !== 'string') return null
  if (/(0\s*[-到]\s*100\s*分)/.test(scenario)) return { min: 0, max: 100 }
  if (/(1\s*[-到]\s*7\s*分)/.test(scenario)) return { min: 1, max: 7 }
  if (/(1\s*[-到]\s*5\s*分)/.test(scenario)) return { min: 1, max: 5 }
  return null
}

function classifyTaskType(task) {
  const scenario = String(task.scenario ?? '')
  const module = String(task.module ?? '')

  if (Array.isArray(task.options) && task.options.length) return 'forcedChoice'
  // 没有 options 但有过程/行为信号的题：属于行为/过程评分
  if (isPlainObject(task.behaviorMonitoring) && Object.keys(task.behaviorMonitoring).length) return 'behavioral'
  if (/(开放式|200字内|请简要描述|请列出|开放题|写下|简述)/.test(scenario) || /开放式/.test(module)) return 'openText'
  if (/(投资|博弈|公共品|信任游戏|资源分配|竞赛|多轮)/.test(scenario) || /(博弈|投资|协作)/.test(module)) return 'game'
  if (
    /(反应时|毫秒|按键|快速|闪现)/.test(scenario) ||
    (isPlainObject(task.behaviorMonitoring) &&
      Object.keys(task.behaviorMonitoring).some((k) => /(reactionTime|decisionTime|responseTime|\bRT\b|RT$)/i.test(k)))
  )
    return 'reactionTime'

  if (/(\(\s*0\s*[-到]\s*100\s*分\s*\)|（\s*0\s*[-到]\s*100\s*分\s*）)/.test(scenario)) return 'numericEntry'
  if (/(\(\s*1\s*[-到]\s*7\s*分\s*\)|（\s*1\s*[-到]\s*7\s*分\s*）)/.test(scenario)) return 'rating'
  if (/0\s*[-到]\s*100\s*分/.test(scenario)) return 'numericEntry'
  if (/1\s*[-到]\s*7\s*分/.test(scenario)) return 'rating'
  if (/1\s*[-到]\s*5\s*分/.test(scenario)) return 'rating'
  if (/(概率|估算|多少|填写|输入|定价|支付多少)/.test(scenario)) return 'numericEntry'

  return 'unknown'
}

const OPTION_EXCLUDE_KEYS = new Set(['optionId', 'type', 'note', 'inconsistencyFlag', 'consistencyFlag'])

function extractOptionOutputs(option) {
  const outputs = {}
  for (const [key, value] of Object.entries(option)) {
    if (OPTION_EXCLUDE_KEYS.has(key)) continue
    // 只把“可计算”的值纳入映射：number 或 object(里面通常是 number)
    // 像“基于准确性赋值”这种字符串说明，不应该被误当成 mapping。
    if (typeof value === 'number' || isPlainObject(value)) {
      outputs[key] = value
    }
  }
  return outputs
}

function buildOptionsMapping(task) {
  if (!Array.isArray(task.options) || task.options.length === 0) return null

  const mapping = {}
  for (const option of task.options) {
    const id = option.optionId
    if (!id) continue
    const outputs = extractOptionOutputs(option)
    if (Object.keys(outputs).length) mapping[id] = outputs
  }
  return Object.keys(mapping).length ? mapping : null
}

function computeNumericRangesFromMapping(mapping) {
  const ranges = new Map()
  if (!mapping) return ranges

  for (const outputs of Object.values(mapping)) {
    for (const [key, value] of Object.entries(outputs)) {
      if (typeof value !== 'number') continue
      const r = ranges.get(key) ?? { min: value, max: value }
      r.min = Math.min(r.min, value)
      r.max = Math.max(r.max, value)
      ranges.set(key, r)
    }
  }
  return ranges
}

function buildRequiredSignals(task, taskType) {
  const signals = []

  if (Array.isArray(task.options) && task.options.length) signals.push('response.selectedOptionId')
  if (taskType === 'openText') signals.push('response.text')
  if (taskType === 'numericEntry' || taskType === 'rating') signals.push('response.numericValue')
  // reactionTime 任务优先使用 behaviorMonitoring 中声明的具体字段；只有没有时才回退到泛化字段。
  if (taskType === 'reactionTime' && !(isPlainObject(task.behaviorMonitoring) && Object.keys(task.behaviorMonitoring).length)) {
    signals.push('behavior.reactionTime')
  }

  if (isPlainObject(task.behaviorMonitoring)) {
    for (const k of Object.keys(task.behaviorMonitoring)) signals.push(`behavior.${k}`)
  }
  return uniq(signals)
}

function buildLikertScaleComputations(task, rangeOverride = null) {
  const scenarioRange = pickRangeFromScenario(String(task.scenario ?? ''))
  const range = clampRange(rangeOverride) ?? clampRange(scenarioRange) ?? { min: 1, max: 5 }

  return [
    {
      kind: 'likertSubscales',
      input: 'response.itemRatings',
      itemScale: range,
      aggregation: 'mean',
      // 条目清单、反向计分、子量表归属都必须由配置明确给出（bib 文本只说“6-8个条目”）。
      parametersRequired: {
        itemsKey: `scales.${task.taskId}.items`,
        reverseItemsKey: `scales.${task.taskId}.reverseItems`,
        subscalesKey: `scales.${task.taskId}.subscales`,
      },
      outputs: [{ key: task.dimensionPrimary }, ...(Array.isArray(task.dimensionSecondary) ? task.dimensionSecondary.map((k) => ({ key: k })) : [])],
      normalizeTo01: true,
      clamp: true,
    },
  ]
}

function buildAccuracySpeedCompositeComputations({
  outputKey,
  accuracyInput = 'behavior.accuracy',
  reactionTimeInput = 'behavior.reactionTime',
  speedInput = null,
  weightsKey,
  normalizationKey,
  accuracyScaleKey,
  rtScaleKey,
}) {
  return [
    {
      kind: 'accuracySpeedComposite',
      inputs: {
        accuracy: accuracyInput,
        reactionTime: reactionTimeInput,
        speed: speedInput,
      },
      parametersRequired: {
        weightsKey,
        normalizationKey,
        accuracyScaleKey,
        rtScaleKey,
      },
      outputKey,
      normalizeTo01: true,
      clamp: true,
    },
  ]
}

function buildOverconfidenceComputations(task) {
  return [
    {
      kind: 'overconfidenceBias',
      inputs: {
        accuracy: 'behavior.accuracy',
        averageConfidence: 'behavior.averageConfidence',
      },
      // 精确尺度（accuracy 是 0-1 还是 0-100；confidence 是 0.5-1 还是 50-100）必须由实现侧声明。
      parametersRequired: {
        accuracyScaleKey: `scales.${task.taskId}.accuracyScale`,
        confidenceScaleKey: `scales.${task.taskId}.confidenceScale`,
      },
      outputKey: 'overconfidenceBias',
    },
    {
      kind: 'absoluteValue',
      input: 'overconfidenceBias',
      outputKey: task.dimensionPrimary,
      notes: '按 rubric：平均信心 - 正确率；绝对值越大偏差越大。',
    },
  ]
}

function buildFlankerComputations(task) {
  return [
    {
      kind: 'difference',
      inputs: {
        a: 'behavior.incongruentRT',
        b: 'behavior.congruentRT',
      },
      outputKey: 'interferenceEffect',
      direction: 'lowerIsBetter',
    },
    {
      kind: 'reverseComposite',
      inputs: ['interferenceEffect', 'behavior.errorRate'],
      parametersRequired: {
        weightsKey: `weights.${task.taskId}`,
        normalizationKey: `norm.${task.taskId}`,
      },
      outputKey: task.dimensionPrimary,
    },
  ]
}

function buildHotColdGapComputations(task) {
  return [
    {
      kind: 'difference',
      inputs: {
        a: 'behavior.desireHotState',
        b: 'behavior.desireColdState',
      },
      outputKey: 'affectiveGap',
    },
    {
      kind: 'inverseAbsolute',
      input: 'affectiveGap',
      // gap 越大得分越低（rubric 反向计分）
      outputKey: task.dimensionPrimary,
      parametersRequired: {
        maxGapKey: `scales.${task.taskId}.maxGap`,
      },
      normalizeTo01: true,
      clamp: true,
    },
  ]
}

function buildFatigueComputations(task) {
  return [
    {
      kind: 'decline',
      inputs: {
        early: 'behavior.earlyPerformance',
        late: 'behavior.latePerformance',
      },
      outputKey: 'performanceDecline',
      parametersRequired: {
        declineFormulaKey: `scales.${task.taskId}.declineFormula`,
      },
    },
    {
      kind: 'reverseNormalize',
      input: 'performanceDecline',
      outputKey: task.dimensionPrimary,
      parametersRequired: {
        normalizationKey: `norm.${task.taskId}`,
      },
      normalizeTo01: true,
      clamp: true,
    },
  ]
}

function buildRegretAvoidanceComputations(task) {
  return [
    {
      kind: 'difference',
      inputs: { a: 'behavior.regretRating', b: 'behavior.rejoiceRating' },
      outputKey: 'affectAsymmetry',
    },
    {
      kind: 'regretAvoidance',
      inputs: {
        choice: 'behavior.choiceItself',
        regret: 'behavior.regretRating',
        rejoice: 'behavior.rejoiceRating',
        asymmetry: 'affectAsymmetry',
      },
      parametersRequired: {
        ratingRangeKey: `scales.${task.taskId}.ratingRange`,
        safeChoiceIdKey: `scales.${task.taskId}.safeChoiceId`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
    },
  ]
}

function buildDivergentThinkingComputations(task) {
  return [
    {
      kind: 'divergentThinkingAUT',
      // counts/typingPattern 可由实现侧从 response.ideas 派生；但为了可实现性，这里同时允许直接输入行为指标。
      inputs: {
        ideas: 'response.ideas',
        totalIdeas: 'behavior.totalIdeas',
        categoryShifts: 'behavior.categoryShifts',
        typingPattern: 'behavior.typingPattern',
      },
      parametersRequired: {
        normsKey: `norms.${task.taskId}.originality`,
        categoryModelKey: `models.${task.taskId}.ideaCategory`,
        zScoreKey: `norm.${task.taskId}`,
      },
      outputs: [
        { key: 'divergentThinkingFluencyScore' },
        { key: 'divergentThinkingOriginalityScore' },
        { key: 'divergentThinkingFlexibilityScore' },
      ],
    },
  ]
}

function buildInformationSeekingThresholdComputations(task) {
  return [
    {
      kind: 'infoPurchaseLogisticThreshold',
      inputs: {
        purchaseDecisions: 'behavior.purchaseRate',
        difficultyProxy: 'behavior.purchaseAccuracyCorrelation',
        confidenceAfterInfo: 'behavior.confidenceAfterInfo',
      },
      parametersRequired: {
        modelKey: `models.${task.taskId}.thresholdFit`,
        costKey: `scales.${task.taskId}.infoCost`,
        hintAccuracyKey: `scales.${task.taskId}.hintAccuracy`,
      },
      outputKey: task.dimensionPrimary,
    },
  ]
}

function buildWorkingMemoryDualTaskComputations(task) {
  return [
    {
      kind: 'dualTaskWorkingMemoryLoad',
      inputs: {
        digitRecallAccuracy: 'behavior.digitRecallAccuracy',
        equationJudgmentAccuracy: 'behavior.equationJudgmentAccuracy',
        dualTaskCost: 'behavior.dualTaskCost',
        responsePattern: 'behavior.responsePattern',
      },
      // 单任务基线不在 bib 中：必须由实现侧提供（可来自同结构的单任务段落或其它 task）
      crossTask: {
        baselineKeyRequired: `baseline.${task.taskId}.singleTask`,
      },
      parametersRequired: {
        weightsKey: `weights.${task.taskId}`,
        normalizationKey: `norm.${task.taskId}`,
        accuracyScaleKey: `scales.${task.taskId}.accuracyScale`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
      notes: '按 rubric：衰减越小分数越高。',
    },
  ]
}

function buildPrimingEffectComputations(task) {
  return [
    {
      kind: 'primingWordCompletion',
      inputs: {
        wordCompletion: 'behavior.wordCompletion',
        primingGroup: 'behavior.primingGroup',
      },
      parametersRequired: {
        groupCodingKey: `scales.${task.taskId}.primingGroupCoding`,
        targetCompletionsKey: `scales.${task.taskId}.targetCompletions`,
        scoringKey: `scales.${task.taskId}.scoring`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
      notes: '按 rubric：在启动组中补全为目标词倾向越强，启动效应越强。',
    },
  ]
}

function buildPlanningFallacyComputations(task) {
  return [
    {
      kind: 'planningFallacyBias',
      inputs: {
        estimatedMostLikelyTime: 'behavior.estimatedMostLikelyTime',
        estimatedConfidentTime: 'behavior.estimatedConfidentTime',
        optimismBias: 'behavior.optimismBias',
      },
      parametersRequired: {
        unitKey: `scales.${task.taskId}.timeUnit`,
        baselineRangeKey: `scales.${task.taskId}.typicalRange`,
        scoringKey: `scales.${task.taskId}.scoring`,
      },
      outputKey: task.dimensionPrimary,
      notes: '按 rubric：显著低估（低于基准下限）得正分，越低估计划谬误越强。',
      normalizeTo01: true,
      clamp: true,
    },
  ]
}

function buildTradeOffOptimizationComputations(task) {
  return [
    {
      kind: 'tradeOffOptimization',
      inputs: {
        allocationPattern: 'behavior.allocationPattern',
        explorationBehavior: 'behavior.explorationBehavior',
        finalScore: 'behavior.finalScore',
      },
      parametersRequired: {
        baselineKey: `baseline.${task.taskId}.randomAllocation`,
        complexityModelKey: `models.${task.taskId}.strategyComplexity`,
        normalizationKey: `norm.${task.taskId}`,
        weightsKey: `weights.${task.taskId}`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
      notes: '按 rubric：相对随机基线提升越大且策略越合理/复杂，得分越高。',
    },
  ]
}

function buildHypothesisTestingComputations(task) {
  return [
    {
      kind: 'hypothesisTestingStrategy',
      inputs: {
        testStrategy: 'behavior.testStrategy',
        numberOfTests: 'behavior.numberOfTests',
        finalRuleCorrect: 'behavior.finalRuleCorrect',
      },
      parametersRequired: {
        strategyCodingKey: `scales.${task.taskId}.strategyCoding`,
        efficiencyCurveKey: `scales.${task.taskId}.efficiencyCurve`,
        weightsKey: `weights.${task.taskId}`,
        normalizationKey: `norm.${task.taskId}`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
      notes: '按 rubric：证伪策略更高分；测试效率与最终正确性共同计入。',
    },
  ]
}

function buildEmotionContagionComputations(task) {
  return [
    {
      kind: 'emotionContagion',
      inputs: {
        emotionChangeReport: 'behavior.emotionChangeReport',
        physiologicalResponse: 'behavior.physiologicalResponse',
        attentionAllocation: 'behavior.attentionAllocation',
      },
      parametersRequired: {
        stimulusValenceKey: `scales.${task.taskId}.stimulusValence`,
        selfReportScaleKey: `scales.${task.taskId}.selfReportScale`,
        weightsKey: `weights.${task.taskId}`,
        normalizationKey: `norm.${task.taskId}`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
      notes: '按 rubric：情绪自报变化与生理反应越一致/越强，情绪感染越明显。',
    },
  ]
}

function buildStrategyShiftUnderPressureComputations(task) {
  return [
    {
      kind: 'conditionDifference',
      inputs: {
        pressure: 'behavior.accuracyTimePressure',
        noPressure: 'behavior.accuracyNoPressure',
      },
      outputKey: 'accuracyDrop',
      direction: 'lowerIsBetter',
      notes: 'accuracyDrop = 无压力 - 有压力；下降越小越好。',
    },
    {
      kind: 'strategyShift',
      input: 'behavior.strategyChange',
      parametersRequired: {
        codingKey: `scales.${task.taskId}.strategyChangeCoding`,
      },
      outputKey: 'strategyShiftIndex',
    },
    {
      kind: 'reverseComposite',
      inputs: ['accuracyDrop', 'strategyShiftIndex'],
      parametersRequired: {
        weightsKey: `weights.${task.taskId}`,
        normalizationKey: `norm.${task.taskId}`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
      notes: '按 rubric：下降小且能灵活切换策略更高分。',
    },
  ]
}

function buildSocialValueDynamicComputations(task) {
  return [
    {
      kind: 'difference',
      inputs: { a: 'behavior.allocationToCooperator', b: 'behavior.baselineAllocation' },
      outputKey: 'rewardCooperatorDelta',
    },
    {
      kind: 'difference',
      inputs: { a: 'behavior.baselineAllocation', b: 'behavior.allocationToFreeRider' },
      outputKey: 'punishFreeRiderDelta',
    },
    {
      kind: 'conditionalCooperation',
      inputs: {
        reward: 'rewardCooperatorDelta',
        punish: 'punishFreeRiderDelta',
        adjustmentSpeed: 'behavior.adjustmentSpeed',
      },
      parametersRequired: {
        weightsKey: `weights.${task.taskId}`,
        normalizationKey: `norm.${task.taskId}`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
      notes: '按 rubric：对合作者更慷慨、对搭便车者更吝啬/惩罚且调整更快 => 高分。',
    },
  ]
}

function buildBehaviorDirectNumericComputations(task, inputKey, range) {
  return [
    {
      kind: 'directNumeric',
      input: inputKey,
      range,
      normalizeTo01: true,
      clamp: true,
    },
  ]
}

function buildPerformanceUnderPressureComputations(task) {
  return [
    {
      kind: 'performanceUnderPressure',
      inputs: {
        accuracy: 'behavior.accuracyUnderPressure',
        speed: 'behavior.speedUnderPressure',
        stressReaction: 'behavior.stressReaction',
      },
      crossTask: {
        baselineKeyRequired: `baseline.${task.taskId}.noPressure`,
      },
      parametersRequired: {
        accuracyScaleKey: `scales.${task.taskId}.accuracyScale`,
        speedScaleKey: `scales.${task.taskId}.speedScale`,
        weightsKey: `weights.${task.taskId}`,
        normalizationKey: `norm.${task.taskId}`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
      notes: '按 rubric：相对无压力基线衰减越小得分越高。',
    },
  ]
}

function buildCognitiveRecoveryComputations(task) {
  return [
    {
      kind: 'cognitiveRecovery',
      inputs: {
        postAccuracy: 'behavior.postStressAccuracy',
        postSpeed: 'behavior.postStressSpeed',
        recoveryRate: 'behavior.recoveryRate',
      },
      crossTask: {
        compareWithTaskIds: ['T97'],
        pressureKeyRequired: 'T97.performanceUnderPressure',
        baselineKeyRequired: `baseline.${task.taskId}.noPressure`,
      },
      parametersRequired: {
        accuracyScaleKey: `scales.${task.taskId}.accuracyScale`,
        speedScaleKey: `scales.${task.taskId}.speedScale`,
        weightsKey: `weights.${task.taskId}`,
        normalizationKey: `norm.${task.taskId}`,
      },
      outputKey: task.dimensionPrimary,
      normalizeTo01: true,
      clamp: true,
      notes: '按 rubric：相对压力态改善幅度 + 接近基线程度综合评分。',
    },
  ]
}

function buildNeedForClosureInfoSeekingComputations(task) {
  return [
    {
      kind: 'nfcInformationSeeking',
      inputs: {
        totalInfoSpent: 'behavior.totalInfoSpent',
        infoSelectionPattern: 'behavior.infoSelectionPattern',
        judgmentConfidenceAfterInfo: 'behavior.judgmentConfidenceAfterInfo',
      },
      parametersRequired: {
        weightsKey: `weights.${task.taskId}`,
        patternScoringKey: `scales.${task.taskId}.patternScoring`,
        normalizationKey: `norm.${task.taskId}`,
      },
      outputKey: task.dimensionPrimary,
      notes: '按 rubric：确认偏差（只买支持性信息）应扣分；总花费是闭合需求的信号之一。',
      normalizeTo01: true,
      clamp: true,
    },
  ]
}

function detectScoringMethod(task, taskType, optionsMapping) {
  const scenario = String(task.scenario ?? '')
  const module = String(task.module ?? '')

  if (optionsMapping) return { type: 'optionsMapping' }
  if (taskType === 'openText') return { type: /(NLP|模型)/.test(scenario) ? 'modelRated' : 'humanRated' }
  if (/信度检验/.test(module) || task.dimensionPrimary === 'dataQuality_Consistency') return { type: 'dataQualityConsistency' }
  if (taskType === 'game' || taskType === 'reactionTime') return { type: 'behavioral' }
  if (taskType === 'numericEntry' || taskType === 'rating') return { type: 'directNumeric' }
  return { type: 'rubricBased' }
}

function buildCrossTask(task) {
  const haystack = `${String(task.note ?? '')} ${JSON.stringify(task.scoringRubric ?? {})}`
  const cross = []
  if (/\bT12\b/.test(haystack)) cross.push('T12')
  if (/\bT11\b/.test(haystack)) cross.push('T11')
  return cross.length ? { compareWithTaskIds: uniq(cross) } : null
}

function parseRubricDimensionsFromMarkdown(calcText) {
  if (!calcText || typeof calcText !== 'string') return []
  const dims = []
  const re = /\n\s*\d+\.\s*\*\*(.+?)\*\*/g
  let m
  while ((m = re.exec(calcText))) {
    dims.push(m[1].trim())
  }
  return uniq(dims)
}

function buildOutputsFromTask(task, mappingRanges) {
  const outputs = []
  const seen = new Set()

  const push = (key, meta = {}) => {
    if (!key || seen.has(key)) return
    seen.add(key)
    outputs.push({ key, ...meta })
  }

  push(task.dimensionPrimary, { role: 'primary' })
  if (Array.isArray(task.dimensionSecondary)) {
    for (const k of task.dimensionSecondary) push(k, { role: 'secondary' })
  }
  if (isPlainObject(task.scoringRubric)) {
    for (const k of Object.keys(task.scoringRubric)) push(k, { role: 'rubric' })
  }
  if (Array.isArray(task.options)) {
    for (const option of task.options) {
      const extracted = extractOptionOutputs(option)
      for (const k of Object.keys(extracted)) push(k, { role: 'optionOutput' })
    }
  }

  // ranges from options mapping
  for (const o of outputs) {
    const r = mappingRanges.get(o.key)
    if (r) o.range = { min: r.min, max: r.max }
  }

  // ranges hinted in rubric text
  if (isPlainObject(task.scoringRubric)) {
    for (const [k, v] of Object.entries(task.scoringRubric)) {
      if (!isPlainObject(v)) continue
      const guessed = guessRangeFromText(v.calculation)
      if (!guessed) continue
      const out = outputs.find((o) => o.key === k)
      if (out && !out.range) out.range = guessed
    }
  }

  // ranges hinted in scenario (0-100, 1-7, 1-5)
  const scenarioRange = pickRangeFromScenario(String(task.scenario ?? ''))
  if (scenarioRange) {
    for (const o of outputs) {
      if (!o.range && (o.key === task.dimensionPrimary || o.role === 'primary')) o.range = scenarioRange
    }
  }

  return outputs
}

function buildForcedChoiceComputations(optionsMapping) {
  // 一个任务可能输出多个维度，映射表里已经包含。
  return [
    {
      kind: 'optionsMapping',
      input: 'response.selectedOptionId',
      mapping: optionsMapping,
    },
  ]
}

function buildOpenTextComputations(task) {
  const rubric = task.scoringRubric || {}
  const firstRubricKey = Object.keys(rubric).find((k) => isPlainObject(rubric[k]) && typeof rubric[k].calculation === 'string')
  const calcText = firstRubricKey ? rubric[firstRubricKey].calculation : ''
  const dims = parseRubricDimensionsFromMarkdown(calcText)

  return [
    {
      kind: 'rubricMean',
      scale: { min: 1, max: 5 },
      dimensions: dims.length ? dims.map((name) => ({ name, weight: 1 })) : null,
      input: 'response.text',
      raterInput: dims.length ? dims.map((d) => `rater.${d}`) : ['rater.score'],
      aggregation: 'mean',
    },
  ]
}

function buildDirectNumericComputations(task) {
  const scenarioRange = pickRangeFromScenario(String(task.scenario ?? ''))
  const range = clampRange(scenarioRange) ?? { min: 0, max: 100 }

  return [
    {
      kind: 'directNumeric',
      input: 'response.numericValue',
      range,
      normalizeTo01: true,
      clamp: true,
    },
  ]
}

function buildBehavioralComputations(task) {
  const behaviorKeys = isPlainObject(task.behaviorMonitoring) ? Object.keys(task.behaviorMonitoring) : []
  return [
    {
      kind: 'behavioralComposite',
      inputs: behaviorKeys.map((k) => `behavior.${k}`),
      // 不在此处臆造权重：把权重与常模参数显式化为必需配置。
      parametersRequired: {
        weightsKey: `weights.${task.taskId}`,
        normalizationKey: `norm.${task.taskId}`,
      },
      normalization: {
        type: 'zScore',
        // mean/std 由 norm.<taskId> 提供
      },
    },
  ]
}

function buildDataQualityComputations(task) {
  const id = String(task.taskId)
  const module = String(task.module ?? '')
  const primaryFunction = isPlainObject(task.scoringRubric) ? String(task.scoringRubric.primaryFunction ?? '') : ''

  // 显式配置基准 taskId：从文本中提取 Txx
  const baseMatch = primaryFunction.match(/\bT(\d{1,3})\b/)
  const baseTaskId = baseMatch ? `T${baseMatch[1]}` : null

  // 规则：
  // - 选项题（parallel 也是选项）：用一致性(agreement)
  // - 连续行为指标：用相关(correlation)
  // 这些本质都需要把“基准任务的某个指标”拿出来，所以 baseTaskId 必填。
  const isOption = Array.isArray(task.options) && task.options.length > 0
  const hasBehavior = isPlainObject(task.behaviorMonitoring) && Object.keys(task.behaviorMonitoring).length > 0

  const kind = isOption && !hasBehavior ? 'agreementWithTask' : 'correlationWithTask'

  const computation = {
    kind,
    baseTaskId,
    // 需要对齐的指标 key：对平行题通常是 *_parallel 字段；如果没有就要求显式配置
    parallelMetricKeyRequired: `parallelMetric.${id}`,
    ...(baseTaskId ? { baseMetricKeyRequired: `baseMetric.${baseTaskId}` } : {}),
    notes: module || primaryFunction,
  }

  return [computation]
}

function applyPerTaskOverrides(task, scoringSpec) {
  const id = String(task.taskId)

  // T11/T12：框架效应跨题计算（不从单题选项直接给分）
  if (id === 'T11' || id === 'T12') {
    scoringSpec.scoringMethod = {
      type: 'crossTaskComposite',
      requiredSignals: ['response.selectedOptionId'],
      crossTask: { compareWithTaskIds: id === 'T11' ? ['T12'] : ['T11'] },
      computations: [
        {
          kind: 'framingEffectPair',
          tasks: ['T11', 'T12'],
          input: {
            T11: 'response.selectedOptionId',
            T12: 'response.selectedOptionId',
          },
          // 强框架效应：收益框架风险规避(A) + 损失框架风险寻求(D)
          scoring: {
            strongPattern: { T11: 'A', T12: 'D', score: 1 },
            // 逻辑一致（都风险规避 或 都风险寻求）视为弱框架效应
            weakPatterns: [
              { T11: 'A', T12: 'C', score: 0 },
              { T11: 'B', T12: 'D', score: 0 },
            ],
            // 其他组合默认 0（可在实现侧改为 0.5）
            defaultScore: 0,
          },
          outputKey: 'framingEffectScore',
          outputRange: { min: 0, max: 1 },
        },
      ],
    }

    scoringSpec.scoringOutputs = scoringSpec.scoringOutputs.map((o) => {
      if (o.key === 'framingEffectScore') return { ...o, range: { min: 0, max: 1 }, role: o.role ?? 'primary' }
      return o
    })
  }

  // T60：SVO 角度（斜率法）
  if (id === 'T60') {
    scoringSpec.taskType = 'game'
    scoringSpec.scoringMethod = {
      type: 'svoAngleSlope',
      requiredSignals: ['behavior.choicePattern'],
      computations: [
        {
          kind: 'linearFitAngle',
          input: 'behavior.choicePattern',
          pointShape: { self: 'number', other: 'number' },
          fit: { method: 'leastSquares', y: 'other', x: 'self' },
          outputKey: 'socialValueOrientationAngle',
          outputUnit: 'degree',
          outputRange: { min: -22.5, max: 45 },
        },
        {
          kind: 'categorize',
          input: 'socialValueOrientationAngle',
          outputKey: 'svotype',
          categoriesRequired: {
            // 角度分段阈值在手册/常规模型中定义，这里显式要求配置
            thresholdsKey: 'svo.thresholds',
          },
        },
      ],
    }
  }

  // 开放题统一：从评分维度(1-5)取平均
  if (/^T9[1-5]$/.test(id)) {
    scoringSpec.taskType = 'openText'
    scoringSpec.scoringMethod = {
      type: 'humanRated',
      requiredSignals: ['response.text'],
      computations: buildOpenTextComputations(task),
    }
  }

  // 信度检验：一致性/相关性
  if (task.dimensionPrimary === 'dataQuality_Consistency' || /信度检验/.test(String(task.module ?? ''))) {
    scoringSpec.taskType = Array.isArray(task.options) && task.options.length ? 'forcedChoice' : 'behavioral'
    scoringSpec.scoringMethod = {
      type: 'dataQualityConsistency',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildDataQualityComputations(task),
    }
  }

  // 更精细的模板：按 taskId 精准对齐 rubric
  if (id === 'T96') {
    scoringSpec.taskType = 'rating'
    scoringSpec.scoringMethod = {
      type: 'likertScale',
      requiredSignals: ['response.itemRatings'],
      computations: buildLikertScaleComputations(task),
    }
    scoringSpec.scoringOutputs = scoringSpec.scoringOutputs.map((o) => {
      if ((o.key === 'perceivedStressScore' || o.key === 'psychologicalResilienceScore') && !o.range) {
        return { ...o, range: { min: 1, max: 5 } }
      }
      return o
    })
  }

  if (id === 'T22') {
    scoringSpec.scoringMethod = {
      type: 'overconfidenceCalibration',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildOverconfidenceComputations(task),
    }
  }

  if (id === 'T52') {
    scoringSpec.scoringMethod = {
      type: 'metacognitiveCalibration',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        ...buildOverconfidenceComputations(task),
        {
          kind: 'reviewAllocationOptimality',
          input: 'behavior.reviewAllocation',
          parametersRequired: {
            modelKey: `models.${id}.reviewAllocation`,
          },
          outputKey: task.dimensionPrimary,
        },
      ],
    }
  }

  if (id === 'T35') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'flankerInterference',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildFlankerComputations(task),
    }
  }

  if (id === 'T65') {
    scoringSpec.scoringMethod = {
      type: 'hotColdAffectiveGap',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildHotColdGapComputations(task),
    }
  }

  if (id === 'T48') {
    scoringSpec.scoringMethod = {
      type: 'cognitiveFatigueResistance',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildFatigueComputations(task),
    }
  }

  if (id === 'T45') {
    scoringSpec.scoringMethod = {
      type: 'regretAvoidance',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildRegretAvoidanceComputations(task),
    }
  }

  if (id === 'T72') {
    scoringSpec.taskType = 'behavioral'
    scoringSpec.scoringMethod = {
      type: 'divergentThinkingAUT',
      requiredSignals: uniq([...buildRequiredSignals(task, scoringSpec.taskType), 'response.ideas']),
      computations: buildDivergentThinkingComputations(task),
    }
  }

  if (id === 'T79') {
    scoringSpec.scoringMethod = {
      type: 'informationSeekingThreshold',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildInformationSeekingThresholdComputations(task),
    }
  }

  if (id === 'T68') {
    scoringSpec.scoringMethod = {
      type: 'needForClosureInformationSeeking',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildNeedForClosureInfoSeekingComputations(task),
    }
  }

  if (id === 'T99') {
    scoringSpec.scoringMethod = {
      type: 'metaConsistency',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      crossTask: {
        // 客观一致性来自其它成对题/一致性模块，这里要求实现侧提供汇总索引
        objectiveConsistencyKeyRequired: 'dataQuality.objectiveConsistencyIndex',
      },
      computations: [
        {
          kind: 'metaConsistencyGap',
          inputs: {
            objective: 'crossTask.objectiveConsistencyIndex',
            subjective: 'behavior.consistencySelfAssessment',
            willingnessToChange: 'behavior.willingnessToChange',
          },
          parametersRequired: {
            weightsKey: `weights.${id}`,
            normalizationKey: `norm.${id}`,
          },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  if (id === 'T10') {
    scoringSpec.scoringMethod = {
      type: 'dualTaskWorkingMemoryLoad',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildWorkingMemoryDualTaskComputations(task),
    }
  }

  if (id === 'T15') {
    scoringSpec.scoringMethod = {
      type: 'primingEffect',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildPrimingEffectComputations(task),
    }
  }

  if (id === 'T16') {
    scoringSpec.scoringMethod = {
      type: 'planningFallacy',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildPlanningFallacyComputations(task),
    }
  }

  if (id === 'T20') {
    scoringSpec.scoringMethod = {
      type: 'tradeOffOptimization',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildTradeOffOptimizationComputations(task),
    }
  }

  if (id === 'T23') {
    scoringSpec.scoringMethod = {
      type: 'hypothesisTesting',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildHypothesisTestingComputations(task),
    }
  }

  if (id === 'T26') {
    scoringSpec.scoringMethod = {
      type: 'emotionalContagion',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildEmotionContagionComputations(task),
    }
  }

  if (id === 'T56') {
    scoringSpec.scoringMethod = {
      type: 'strategyShiftUnderTimePressure',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildStrategyShiftUnderPressureComputations(task),
    }
  }

  if (id === 'T66') {
    scoringSpec.scoringMethod = {
      type: 'socialValueDynamicAdjustment',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildSocialValueDynamicComputations(task),
    }
  }

  if (id === 'T77') {
    scoringSpec.scoringMethod = {
      type: 'futureSelfContinuityOverlap',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildBehaviorDirectNumericComputations(task, 'behavior.overlapPercentage', { min: 0, max: 100 }),
    }
    scoringSpec.scoringOutputs = scoringSpec.scoringOutputs.map((o) => {
      if (o.key === task.dimensionPrimary) return { ...o, range: { min: 0, max: 100 } }
      return o
    })
  }

  if (id === 'T97') {
    scoringSpec.scoringMethod = {
      type: 'performanceUnderPressure',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildPerformanceUnderPressureComputations(task),
    }
  }

  if (id === 'T98') {
    scoringSpec.scoringMethod = {
      type: 'cognitiveRecovery',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildCognitiveRecoveryComputations(task),
    }
  }

  // T73：认知闭合需求量表（1-7）
  if (id === 'T73') {
    scoringSpec.taskType = 'rating'
    scoringSpec.scoringMethod = {
      type: 'likertScale',
      requiredSignals: ['response.itemRatings'],
      computations: buildLikertScaleComputations(task, { min: 1, max: 7 }),
    }
    scoringSpec.scoringOutputs = scoringSpec.scoringOutputs.map((o) => {
      if (o.key === task.dimensionPrimary && !o.range) return { ...o, range: { min: 1, max: 7 } }
      return o
    })
  }

  // T1：干扰增量越小越好，标准化到 -1..+1
  if (id === 'T1') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'interferenceInhibition',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'reverseNormalizeToRange',
          input: 'behavior.interferenceEffect',
          targetRange: { min: -1, max: 1 },
          parametersRequired: {
            normalizationKey: `norm.${id}`,
          },
          outputKey: task.dimensionPrimary,
        },
      ],
    }
    scoringSpec.scoringOutputs = scoringSpec.scoringOutputs.map((o) => {
      if (o.key === task.dimensionPrimary) return { ...o, range: { min: -1, max: 1 } }
      return o
    })
  }

  // T3：锚定偏差（向锚偏移越强偏差越大）
  if (id === 'T3') {
    scoringSpec.scoringMethod = {
      type: 'anchoringBias',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'anchoringInfluence',
          input: 'behavior.anchorInfluence',
          parametersRequired: {
            trueValueKey: `scales.${id}.trueValue`,
            anchorValueKey: `scales.${id}.anchorValue`,
            normalizationKey: `norm.${id}`,
          },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T13：情感预测偏差（预测增幅越极端越可能偏差）
  if (id === 'T13') {
    scoringSpec.scoringMethod = {
      type: 'affectiveForecastingBias',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'extremity',
          input: 'behavior.predictedIncrease',
          range: { min: 0, max: 100 },
          parametersRequired: {
            normsKey: `norms.${id}.predictedIncrease`,
          },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // 直觉/识别类：准确率 + 速度 综合
  if (id === 'T17') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'visualIntuition',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildAccuracySpeedCompositeComputations({
        outputKey: task.dimensionPrimary,
        accuracyInput: 'behavior.accuracy',
        reactionTimeInput: 'behavior.reactionTime',
        weightsKey: `weights.${id}`,
        normalizationKey: `norm.${id}`,
        accuracyScaleKey: `scales.${id}.accuracyScale`,
        rtScaleKey: `scales.${id}.rtScale`,
      }),
    }
  }

  if (id === 'T31') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'linguisticIntuition',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildAccuracySpeedCompositeComputations({
        outputKey: task.dimensionPrimary,
        accuracyInput: 'behavior.accuracy',
        reactionTimeInput: 'behavior.speed',
        weightsKey: `weights.${id}`,
        normalizationKey: `norm.${id}`,
        accuracyScaleKey: `scales.${id}.accuracyScale`,
        rtScaleKey: `scales.${id}.speedScale`,
      }),
    }
  }

  if (id === 'T33') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'spatialIntuition',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: buildAccuracySpeedCompositeComputations({
        outputKey: task.dimensionPrimary,
        accuracyInput: 'behavior.accuracy',
        reactionTimeInput: 'behavior.responseTime',
        weightsKey: `weights.${id}`,
        normalizationKey: `norm.${id}`,
        accuracyScaleKey: `scales.${id}.accuracyScale`,
        rtScaleKey: `scales.${id}.rtScale`,
      }),
    }
  }

  // T19：社会直觉（需要答案 key 才能计算准确率）
  if (id === 'T19') {
    scoringSpec.taskType = 'forcedChoice'
    scoringSpec.scoringMethod = {
      type: 'socialIntuitionAccuracy',
      requiredSignals: uniq(['response.selectedOptionId', ...buildRequiredSignals(task, scoringSpec.taskType)]),
      computations: [
        {
          kind: 'answerKeyAccuracy',
          input: 'response.selectedOptionId',
          parametersRequired: {
            answerKey: `answerKey.${id}`,
            scoringKey: `scales.${id}.scoring`,
          },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T21：切换成本/疲劳效应 越小越好（反向）
  if (id === 'T21') {
    scoringSpec.scoringMethod = {
      type: 'cognitiveModeSwitching',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'reverseComposite',
          inputs: ['behavior.switchCost', 'behavior.fatigueEffect'],
          parametersRequired: {
            weightsKey: `weights.${id}`,
            normalizationKey: `norm.${id}`,
          },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T25：反事实思维（原因数量/多样性/可控性分析）
  if (id === 'T25') {
    scoringSpec.scoringMethod = {
      type: 'counterfactualThinking',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'counterfactualComposite',
          inputs: {
            numberOfCauses: 'behavior.numberOfCauses',
            controllabilityAnalysis: 'behavior.controllabilityAnalysis',
            thinkingTime: 'behavior.thinkingTime',
          },
          parametersRequired: {
            diversityModelKey: `models.${id}.diversity`,
            controllabilityKey: `scales.${id}.controllability`,
            normalizationKey: `norm.${id}`,
            weightsKey: `weights.${id}`,
          },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T28：感知自控（自评标准化 + 与实际表现差距）
  if (id === 'T28') {
    scoringSpec.scoringMethod = {
      type: 'perceivedSelfControl',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'directNumeric',
          input: 'behavior.selfRating',
          range: { min: 0, max: 100 },
          normalizeTo01: true,
          clamp: true,
          outputKey: 'selfRating01',
        },
        {
          kind: 'absoluteDifference',
          inputs: { a: 'selfRating01', b: 'behavior.actualPerformance' },
          outputKey: 'calibrationGap',
        },
        {
          kind: 'reverseComposite',
          inputs: ['calibrationGap'],
          parametersRequired: { normalizationKey: `norm.${id}`, weightsKey: `weights.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T29：资源分配策略（方案/理由质量/灵活性）
  if (id === 'T29') {
    scoringSpec.scoringMethod = {
      type: 'resourceAllocationStrategy',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'planningQualityComposite',
          inputs: {
            allocationPlan: 'behavior.allocationPlan',
            reasoningQuality: 'behavior.reasoningQuality',
            planFlexibility: 'behavior.planFlexibility',
          },
          parametersRequired: {
            codingKey: `scales.${id}.coding`,
            normalizationKey: `norm.${id}`,
            weightsKey: `weights.${id}`,
          },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T30：持续注意（d' + 警觉下降 + RT 变异）
  if (id === 'T30') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'sustainedAttention',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'signalDetection',
          inputs: { hitRate: 'behavior.hitRate', falseAlarms: 'behavior.falseAlarms' },
          outputs: { dPrime: 'dPrime', beta: 'beta' },
          parametersRequired: { correctionKey: `scales.${id}.sdCorrection` },
        },
        {
          kind: 'reverseComposite',
          inputs: ['behavior.vigilanceDecrement', 'behavior.responseTimeVariability'],
          parametersRequired: { weightsKey: `weights.${id}`, normalizationKey: `norm.${id}` },
          outputKey: 'stabilityIndex',
          normalizeTo01: true,
          clamp: true,
        },
        {
          kind: 'composite',
          inputs: ['dPrime', 'stabilityIndex'],
          parametersRequired: { weightsKey: `weights.${id}.final`, normalizationKey: `norm.${id}.final` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T32：元认知监控（1 - |估计-实际|/10）
  if (id === 'T32') {
    scoringSpec.scoringMethod = {
      type: 'metacognitiveMonitoring',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'metacognitiveAccuracy',
          inputs: { estimated: 'behavior.estimatedPerformance', actual: 'behavior.actualPerformance' },
          parametersRequired: { maxScore: 10 },
          outputKey: task.dimensionPrimary,
          outputRange: { min: 0, max: 1 },
          clamp: true,
        },
      ],
    }
    scoringSpec.scoringOutputs = scoringSpec.scoringOutputs.map((o) => {
      if (o.key === task.dimensionPrimary) return { ...o, range: { min: 0, max: 1 } }
      return o
    })
  }

  // T36：动态风险调整（适应性 vs 承诺升级）
  if (id === 'T36') {
    scoringSpec.scoringMethod = {
      type: 'dynamicRiskAdjustment',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'riskAdjustmentIndex',
          inputs: {
            investmentPattern: 'behavior.investmentPattern',
            escalationOfCommitment: 'behavior.escalationOfCommitment',
            strategyConsistency: 'behavior.strategyConsistency',
          },
          parametersRequired: {
            modelKey: `models.${id}.adjustment`,
            normalizationKey: `norm.${id}`,
            weightsKey: `weights.${id}`,
          },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T39：信任/可信度（两输出，角色数据需实现侧提供）
  if (id === 'T39') {
    scoringSpec.scoringMethod = {
      type: 'trustGame',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'trustScore',
          inputs: { investmentAmount: 'behavior.investmentAmount', stability: 'behavior.reactionToReturn' },
          parametersRequired: { normalizationKey: `norm.${id}.trust`, weightsKey: `weights.${id}.trust` },
          outputKey: 'trustScore',
          normalizeTo01: true,
          clamp: true,
        },
        {
          kind: 'trustworthinessScore',
          // 返还比例可能在实现侧补充为 behavior.returnRate
          input: 'behavior.returnRate',
          parametersRequired: { normalizationKey: `norm.${id}.trustworthiness` },
          outputKey: 'trustworthinessScore',
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T40：声誉敏感性（与无声誉基线对比）
  if (id === 'T40') {
    scoringSpec.scoringMethod = {
      type: 'reputationSensitivity',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'reputationContributionDelta',
          inputs: {
            contributionWithReputation: 'behavior.contributionWithReputation',
            contributionChange: 'behavior.contributionChange',
            reputationUse: 'behavior.reputationUse',
          },
          crossTask: { baselineKeyRequired: `baseline.${id}.noReputation` },
          parametersRequired: { normalizationKey: `norm.${id}`, weightsKey: `weights.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T42：跨领域延迟满足一致性（标准差越小越好 -> 反向）
  if (id === 'T42') {
    scoringSpec.scoringMethod = {
      type: 'intertemporalConsistency',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'consistencyFromChoices',
          inputs: { choicePatterns: 'behavior.choicePatterns', responseVariance: 'behavior.responseVariance' },
          parametersRequired: { domainMapKey: `scales.${id}.domains`, normalizationKey: `norm.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
          notes: '按 rubric：标准差小（更一致）得高分。',
        },
      ],
    }
  }

  // T43：情绪调节与决策（情绪影响小 + 恢复快）
  if (id === 'T43') {
    scoringSpec.scoringMethod = {
      type: 'emotionRegulationDecision',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'emotionImpact',
          inputs: { riskTaking: 'behavior.postEmotionRiskTaking', recoveryTime: 'behavior.recoveryTime' },
          crossTask: { baselineKeyRequired: `baseline.${id}.noEmotion` },
          parametersRequired: { weightsKey: `weights.${id}`, normalizationKey: `norm.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T44：第三方惩罚（惩罚高且成本不敏感更高分）
  if (id === 'T44') {
    scoringSpec.scoringMethod = {
      type: 'thirdPartyPunishment',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'punishmentComposite',
          inputs: { punishmentAmount: 'behavior.punishmentAmount', costSensitivity: 'behavior.costSensitivity', decisionTime: 'behavior.decisionTime' },
          parametersRequired: { weightsKey: `weights.${id}`, normalizationKey: `norm.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T46：合作信号识别（d'）
  if (id === 'T46') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'cooperationSignalDetection',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'signalDetectionFromBias',
          inputs: { accuracy: 'behavior.accuracy', responseBias: 'behavior.responseBias' },
          parametersRequired: { sdModelKey: `models.${id}.sd`, normalizationKey: `norm.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T51：预先承诺价值（WTP 标准化，可按确定性加权）
  if (id === 'T51') {
    scoringSpec.scoringMethod = {
      type: 'precommitmentValuation',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'wtpNormalize',
          inputs: { willingnessToPay: 'behavior.willingnessToPay', certainty: 'behavior.responseCertainty' },
          parametersRequired: { maxPayKey: `scales.${id}.maxPay`, certaintyScaleKey: `scales.${id}.certaintyScale` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T54：情绪识别（总体正确率 / d'）
  if (id === 'T54') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'emotionRecognition',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'accuracyOrDPrime',
          inputs: { overallAccuracy: 'behavior.overallAccuracy', specificEmotionAccuracy: 'behavior.specificEmotionAccuracy', responseTime: 'behavior.responseTime' },
          parametersRequired: { scoringKey: `scales.${id}.scoring`, normalizationKey: `norm.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T57：框架敏感性 |图表-文字| / 100
  if (id === 'T57') {
    scoringSpec.scoringMethod = {
      type: 'framingEffectSusceptibility',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'absoluteDifference',
          inputs: { a: 'behavior.ratingGraph', b: 'behavior.ratingText' },
          outputKey: 'ratingDifference',
        },
        {
          kind: 'scaleDivide',
          input: 'ratingDifference',
          divisor: 100,
          outputKey: task.dimensionPrimary,
          clamp: true,
          outputRange: { min: 0, max: 1 },
        },
      ],
    }
    scoringSpec.scoringOutputs = scoringSpec.scoringOutputs.map((o) => {
      if (o.key === task.dimensionPrimary) return { ...o, range: { min: 0, max: 1 } }
      return o
    })
  }

  // T61：闭合需求（少线索/短时 + 高信心低准确）
  if (id === 'T61') {
    scoringSpec.scoringMethod = {
      type: 'needForClosureBehavioral',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'nfcBehavioralComposite',
          inputs: {
            clicks: 'behavior.clicksBeforeDecision',
            decisionTime: 'behavior.decisionTime',
            confidence: 'behavior.confidence',
            accuracy: 'behavior.accuracy',
          },
          parametersRequired: { weightsKey: `weights.${id}`, normalizationKey: `norm.${id}`, confidenceScaleKey: `scales.${id}.confidenceScale` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T62：纯洁基石（纯洁评分均值）
  if (id === 'T62') {
    scoringSpec.taskType = 'rating'
    scoringSpec.scoringMethod = {
      type: 'moralFoundationPurity',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'directNumeric',
          input: 'behavior.ratingPurity',
          range: { min: 1, max: 7 },
          normalizeTo01: true,
          clamp: true,
          outputKey: task.dimensionPrimary,
        },
      ],
    }
    scoringSpec.scoringOutputs = scoringSpec.scoringOutputs.map((o) => {
      if (o.key === task.dimensionPrimary) return { ...o, range: { min: 1, max: 7 } }
      return o
    })
  }

  // T64：二阶信念（与贝叶斯正确概率差距越小越好）
  if (id === 'T64') {
    scoringSpec.scoringMethod = {
      type: 'secondOrderBeliefBayesGap',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'reverseAbsoluteError',
          inputs: { estimate: 'behavior.inferredProbability', truth: 'config.bayesCorrectProbability' },
          parametersRequired: { truthKey: `scales.${id}.bayesCorrectProbability`, maxError: 1 },
          outputKey: task.dimensionPrimary,
          outputRange: { min: 0, max: 1 },
          clamp: true,
        },
      ],
    }
    scoringSpec.scoringOutputs = scoringSpec.scoringOutputs.map((o) => {
      if (o.key === task.dimensionPrimary) return { ...o, range: { min: 0, max: 1 } }
      return o
    })
  }

  // T67：小概率加权（前景理论拟合）
  if (id === 'T67') {
    scoringSpec.scoringMethod = {
      type: 'probabilityWeightingFit',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'prospectTheoryWeightingFit',
          inputs: { priceA: 'behavior.priceA', priceB: 'behavior.priceB', priceC: 'behavior.priceC', ratioToEV: 'behavior.ratioToEV' },
          parametersRequired: { lotteriesKey: `scales.${id}.lotteries`, fitModelKey: `models.${id}.weighting`, normalizationKey: `norm.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T70：策略元认知（自评剖面 vs 行为剖面相关）
  if (id === 'T70') {
    scoringSpec.taskType = 'rating'
    scoringSpec.scoringMethod = {
      type: 'metacognitiveStrategyProfile',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      crossTask: {
        behaviorProfileKeyRequired: 'strategyProfiles.behavior',
      },
      computations: [
        {
          kind: 'profileCorrelation',
          inputs: { selfReport: 'behavior.selfReportStrategy', behaviorProfile: 'crossTask.behaviorProfile' },
          parametersRequired: { mappingKey: `scales.${id}.strategyDimensions`, normalizationKey: `norm.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T75：错误监控（后错误减慢 + 准确率恢复）
  if (id === 'T75') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'errorMonitoring',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'postErrorSlowing',
          input: 'behavior.postErrorReactionTime',
          crossTask: { baselineKeyRequired: `baseline.${id}.preErrorReactionTime` },
          outputKey: 'postErrorSlowingIndex',
        },
        {
          kind: 'errorRecovery',
          input: 'behavior.postErrorAccuracy',
          parametersRequired: { accuracyScaleKey: `scales.${id}.accuracyScale` },
          outputKey: 'postErrorAccuracyIndex',
        },
        {
          kind: 'composite',
          inputs: ['postErrorSlowingIndex', 'postErrorAccuracyIndex'],
          parametersRequired: { weightsKey: `weights.${id}`, normalizationKey: `norm.${id}` },
          outputKey: task.dimensionPrimary,
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  // T78：审美一致性 + 审美速度
  if (id === 'T78') {
    scoringSpec.taskType = 'reactionTime'
    scoringSpec.scoringMethod = {
      type: 'aestheticJudgment',
      requiredSignals: buildRequiredSignals(task, scoringSpec.taskType),
      computations: [
        {
          kind: 'normalize',
          input: 'behavior.ratingConsistency',
          parametersRequired: { normalizationKey: `norm.${id}.consistency` },
          outputKey: 'aestheticConsistencyScore',
          normalizeTo01: true,
          clamp: true,
        },
        {
          kind: 'inverseNormalize',
          input: 'behavior.averageReactionTime',
          parametersRequired: { normalizationKey: `norm.${id}.speed` },
          outputKey: 'aestheticSpeedScore',
          normalizeTo01: true,
          clamp: true,
        },
      ],
    }
  }

  return scoringSpec
}

function buildScoringSpec(task) {
  const taskType = classifyTaskType(task)
  const optionsMapping = buildOptionsMapping(task)
  const mappingRanges = computeNumericRangesFromMapping(optionsMapping)

  const methodBase = detectScoringMethod(task, taskType, optionsMapping)
  const requiredSignals = buildRequiredSignals(task, taskType)

  /** @type {{ type: string, requiredSignals: string[], computations: any[] }} */
  let scoringMethod

  if (methodBase.type === 'optionsMapping' && optionsMapping) {
    scoringMethod = {
      type: 'optionsMapping',
      requiredSignals,
      computations: buildForcedChoiceComputations(optionsMapping),
    }
  } else if (taskType === 'openText') {
    scoringMethod = {
      type: methodBase.type,
      requiredSignals: ['response.text'],
      computations: buildOpenTextComputations(task),
    }
  } else if (methodBase.type === 'directNumeric') {
    scoringMethod = {
      type: 'directNumeric',
      requiredSignals: ['response.numericValue'],
      computations: buildDirectNumericComputations(task),
    }
  } else if (methodBase.type === 'dataQualityConsistency') {
    scoringMethod = {
      type: 'dataQualityConsistency',
      requiredSignals,
      computations: buildDataQualityComputations(task),
    }
  } else {
    scoringMethod = {
      type: methodBase.type,
      requiredSignals,
      computations: buildBehavioralComputations(task),
    }
  }

  const crossTask = buildCrossTask(task)
  if (crossTask) scoringMethod.crossTask = crossTask

  const scoringSpec = {
    version: 'v1.0.4',
    taskType,
    scoringMethod,
    scoringOutputs: buildOutputsFromTask(task, mappingRanges),
  }

  return applyPerTaskOverrides(task, scoringSpec)
}

function addScoringSpecToTasks(root) {
  if (!Array.isArray(root.tasks)) throw new Error('root.tasks missing or not an array')

  const overwrite = process.argv.includes('--overwrite')

  let changed = 0
  root.tasks = root.tasks.map((task) => {
    if (!isPlainObject(task)) return task
    if (task.scoringSpec && !overwrite) return task

    const spec = buildScoringSpec(task)
    const ordered = {}
    let inserted = false

    for (const [k, v] of Object.entries(task)) {
      // overwrite 模式下用新生成的 scoringSpec 替换旧值
      if (overwrite && k === 'scoringSpec') continue
      ordered[k] = v
      if (k === 'scoringRubric') {
        ordered.scoringSpec = spec
        inserted = true
      }
    }

    if (!inserted) ordered.scoringSpec = spec
    changed++
    return ordered
  })

  return changed
}

function main() {
  let text = fs.readFileSync(BIB_PATH, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const root = JSON.parse(text)

  const changed = addScoringSpecToTasks(root)
  fs.writeFileSync(BIB_PATH, JSON.stringify(root, null, 2) + '\n', 'utf8')
  console.log(`Added scoringSpec to ${changed} tasks.`)
}

main()
