// 工作评价 页面脚本
function __init__() {
  console.log('工作评价页面已加载')
  // 初始化统计
  refreshStats()
}

// ===== 统计刷新 =====
function refreshStats() {
  const view = $dataSet?.getView('workEvaluations', 'default')
  if (!view) return
  
  const rows = view.rows || []
  const totalCount = rows.length
  const completedCount = rows.filter(r => r.status === '已完成').length
  const inProgressCount = rows.filter(r => r.status === '进行中').length
  const pendingCount = rows.filter(r => r.status === '待评价').length
  
  // 计算平均分（只统计有分数的评价）
  const scoredRows = rows.filter(r => r.overallScore && r.overallScore > 0)
  const avgScore = scoredRows.length > 0
    ? Math.round(scoredRows.reduce((s, r) => s + r.overallScore, 0) / scoredRows.length * 10) / 10
    : 0
  
  // 更新统计卡片显示
  // 通过组件 API 更新统计数值（如果框架支持直接设置值）
  console.log('统计已刷新:', { totalCount, completedCount, inProgressCount, pendingCount, avgScore })
}

// ===== 表格行点击 - 打开评价详情对话框 =====
function handleRowClick(row) {
  if (!row || !row.id) return
  
  // 加载关联的维度数据
  loadDimensions(row.id)
  
  const dialogApi = $components.getApi('eval-dialog')
  if (dialogApi) {
    dialogApi.open()
  }
}

// ===== 加载当前评价的维度数据 =====
function loadDimensions(evaluationId) {
  const dimView = $dataSet?.getView('evaluationDimensions', 'default')
  const evalView = $dataSet?.getView('workEvaluations', 'default')
  if (!dimView || !evalView) return
  
  // 找到当前评价
  const currentEval = evalView.rows?.find(r => r.id === evaluationId)
  if (!currentEval) return
  
  // 如果当前评价还没有维度数据，自动创建默认维度
  const existingDims = (dimView.rows || []).filter(d => d.evaluationId === evaluationId)
  if (existingDims.length === 0) {
    const dimensions = ['工作质量', '交付效率', '团队协作', '创新能力', '文档规范']
    const weights = [0.3, 0.25, 0.2, 0.15, 0.1]
    dimensions.forEach((name, idx) => {
      dimView.appendRow({
        id: 'DIM-' + String(Date.now() + idx).slice(-6),
        evaluationId: evaluationId,
        dimensionName: name,
        score: 0,
        maxScore: 10,
        weight: weights[idx],
        remark: ''
      })
    })
  }
}

// ===== 当前行变化处理 =====
function handleCurrentChange(currentRow) {
  if (currentRow && currentRow.id) {
    console.log('当前选中评价:', currentRow.id, currentRow.projectName)
    // 加载维度数据
    loadDimensions(currentRow.id)
  }
}

// ===== 选中行变化 =====
function handleSelectionChange(selection) {
  console.log('选中行数:', selection.length)
}

// ===== 对话框打开回调 =====
function handleDialogOpen() {
  console.log('评价详情对话框已打开')
}

// ===== 对话框关闭回调 =====
function handleDialogClose() {
  console.log('评价详情对话框已关闭')
}

// ===== 维度编辑对话框打开 =====
function handleDimDialogOpen() {
  console.log('维度编辑对话框已打开')
}

// ===== 维度编辑对话框关闭 =====
function handleDimDialogClose() {
  console.log('维度编辑对话框已关闭')
}

// ===== 新增评价 =====
function handleAddEvaluation() {
  const view = $dataSet?.getView('workEvaluations', 'default')
  if (!view) return
  
  const now = new Date()
  const newId = 'EVAL-' + String(now.getTime()).slice(-6)
  
  view.appendRow({
    id: newId,
    projectName: '',
    teamName: '',
    evaluationPeriod: '',
    overallScore: 0,
    status: '待评价',
    evaluator: '',
    evaluationDate: '',
    comments: '',
    improvements: '',
    createdAt: now.toISOString()
  })
  
  // 同时添加默认维度行
  const dimView = $dataSet?.getView('evaluationDimensions', 'default')
  if (dimView) {
    const dimensions = ['工作质量', '交付效率', '团队协作', '创新能力', '文档规范']
    const weights = [0.3, 0.25, 0.2, 0.15, 0.1]
    dimensions.forEach((name, idx) => {
      dimView.appendRow({
        id: 'DIM-' + String(now.getTime() + idx).slice(-6),
        evaluationId: newId,
        dimensionName: name,
        score: 0,
        maxScore: 10,
        weight: weights[idx],
        remark: ''
      })
    })
  }
  
  refreshStats()
  $page.showMessage({ type: 'success', message: '已创建新评价，请填写详细信息' })
}

// ===== 刷新评价列表 =====
function handleRefresh() {
  const view = $dataSet?.getView('workEvaluations', 'default')
  if (view) {
    view.refresh()
    refreshStats()
    $page.showMessage({ type: 'info', message: '列表已刷新' })
  }
}

// ===== 删除评价 =====
function handleDeleteEvaluation(row) {
  if (!row || !row.id) return
  
  $page.showConfirm({
    message: '确定要删除该评价吗？关联的维度数据也将被删除。',
    title: '确认删除',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(function() {
    const view = $dataSet?.getView('workEvaluations', 'default')
    if (view) {
      view.deleteRowById(row.id)
    }
    // 删除关联维度
    const dimView = $dataSet?.getView('evaluationDimensions', 'default')
    if (dimView) {
      const dimRows = dimView.rows || []
      for (let i = dimRows.length - 1; i >= 0; i--) {
        if (dimRows[i].evaluationId === row.id) {
          dimView.deleteRowById(dimRows[i].id)
        }
      }
    }
    refreshStats()
    $page.showMessage({ type: 'success', message: '评价已删除' })
  }).catch(function() {
    // 用户取消删除
  })
}

// ===== 保存评价表单 =====
function handleSaveEvaluation() {
  const formApi = $components.getApi('eval-form')
  if (!formApi) return
  
  const formData = formApi.getFormData()
  if (!formData) return
  
  // 校验必填字段
  if (!formData.projectName || !formData.teamName || !formData.evaluationPeriod) {
    $page.showMessage({ type: 'warning', message: '请填写项目名称、团队人员和评价周期' })
    return
  }
  
  const view = $dataSet?.getView('workEvaluations', 'default')
  if (!view) return
  
  // 根据维度评分加权计算总体评分
  const dimView = $dataSet?.getView('evaluationDimensions', 'default')
  if (dimView && formData.id) {
    const relatedDims = (dimView.rows || []).filter(d => d.evaluationId === formData.id)
    if (relatedDims.length > 0) {
      var weightedScore = 0
      var totalWeight = 0
      relatedDims.forEach(function(dim) {
        var w = dim.weight || 0
        var s = dim.score || 0
        var m = dim.maxScore || 10
        weightedScore = weightedScore + (s / m) * 100 * w
        totalWeight = totalWeight + w
      })
      if (totalWeight > 0) {
        formData.overallScore = Math.round(weightedScore / totalWeight)
      }
    }
  }
  
  // 如果状态是"待评价"且填写了评价内容，自动更新状态
  if (formData.status === '待评价' && (formData.comments || formData.overallScore > 0)) {
    formData.status = '进行中'
  }
  
  // 如果填写了评价意见和评分，自动标记为已完成
  if (formData.comments && formData.overallScore > 0 && formData.evaluator) {
    formData.status = '已完成'
    if (!formData.evaluationDate) {
      formData.evaluationDate = new Date().toISOString().split('T')[0]
    }
  }
  
  view.updateRowById(formData.id, formData)
  
  const dialogApi = $components.getApi('eval-dialog')
  if (dialogApi) {
    dialogApi.close()
  }
  
  refreshStats()
  $page.showMessage({ type: 'success', message: '评价已保存' })
}

// ===== 新增维度 =====
function handleAddDimension() {
  var currentRow = $dataSet?.getView('workEvaluations', 'default')?.currentRow
  if (!currentRow || !currentRow.id) {
    $page.showMessage({ type: 'warning', message: '请先在评价列表中选择一条评价' })
    return
  }
  
  const dimView = $dataSet?.getView('evaluationDimensions', 'default')
  if (!dimView) return
  
  dimView.appendRow({
    id: 'DIM-' + String(Date.now()).slice(-6),
    evaluationId: currentRow.id,
    dimensionName: '新维度',
    score: 0,
    maxScore: 10,
    weight: 0.1,
    remark: ''
  })
  
  $page.showMessage({ type: 'success', message: '已添加新维度' })
}

// ===== 编辑维度 - 打开维度编辑对话框 =====
function handleEditDimension(row) {
  if (!row || !row.id) return
  
  // 打开维度编辑对话框，让用户编辑完整维度信息
  const dialogApi = $components.getApi('dim-dialog')
  if (dialogApi) {
    dialogApi.open()
  }
}

// ===== 维度行点击 =====
function handleDimensionRowClick(row) {
  if (!row || !row.id) return
  // 点击维度行时自动进入编辑
  handleEditDimension(row)
}

// ===== 保存维度编辑 =====
function handleSaveDimension() {
  const formApi = $components.getApi('dim-form')
  if (!formApi) return
  
  const formData = formApi.getFormData()
  if (!formData) return
  
  // 校验必填字段
  if (!formData.dimensionName) {
    $page.showMessage({ type: 'warning', message: '请输入维度名称' })
    return
  }
  
  const dimView = $dataSet?.getView('evaluationDimensions', 'default')
  if (!dimView) return
  
  // 更新维度数据
  dimView.updateRowById(formData.id, {
    dimensionName: formData.dimensionName,
    score: formData.score || 0,
    maxScore: formData.maxScore || 10,
    weight: formData.weight || 0,
    remark: formData.remark || ''
  })
  
  // 更新后自动重算总体评分
  if (formData.evaluationId) {
    recalculateOverallScore(formData.evaluationId)
  }
  
  const dialogApi = $components.getApi('dim-dialog')
  if (dialogApi) {
    dialogApi.close()
  }
  
  $page.showMessage({ type: 'success', message: '维度已更新' })
}

// ===== 删除维度 =====
function handleDeleteDimension(row) {
  if (!row || !row.id) return
  
  $page.showConfirm({
    message: '确定要删除维度"' + (row.dimensionName || '') + '"吗？',
    title: '确认删除',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(function() {
    const dimView = $dataSet?.getView('evaluationDimensions', 'default')
    if (!dimView) return
    
    dimView.deleteRowById(row.id)
    
    // 删除后重算总体评分
    if (row.evaluationId) {
      recalculateOverallScore(row.evaluationId)
    }
    
    $page.showMessage({ type: 'success', message: '维度已删除' })
  }).catch(function() {
    // 用户取消
  })
}

// ===== 重算总体评分 =====
function recalculateOverallScore(evaluationId) {
  if (!evaluationId) return
  
  const dimView = $dataSet?.getView('evaluationDimensions', 'default')
  const evalView = $dataSet?.getView('workEvaluations', 'default')
  if (!dimView || !evalView) return
  
  const relatedDims = (dimView.rows || []).filter(function(d) { return d.evaluationId === evaluationId })
  if (relatedDims.length === 0) return
  
  var weightedScore = 0
  var totalWeight = 0
  relatedDims.forEach(function(dim) {
    var w = dim.weight || 0
    var s = dim.score || 0
    var m = dim.maxScore || 10
    weightedScore = weightedScore + (s / m) * 100 * w
    totalWeight = totalWeight + w
  })
  
  var newScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0
  evalView.updateRowById(evaluationId, { overallScore: newScore })
  
  refreshStats()
}

// ===== 导出评价数据 =====
function handleExport() {
  const view = $dataSet?.getView('workEvaluations', 'default')
  if (!view || !view.rows || view.rows.length === 0) {
    $page.showMessage({ type: 'warning', message: '没有可导出的数据' })
    return
  }
  
  // 构建 CSV 数据
  var headers = ['评价ID', '项目名称', '团队/人员', '评价周期', '总体评分', '状态', '评价人', '评价日期', '评价意见', '改进建议']
  var rows = view.rows.map(function(r) {
    return [
      r.id, r.projectName, r.teamName, r.evaluationPeriod,
      r.overallScore, r.status, r.evaluator, r.evaluationDate,
      (r.comments || '').replace(/,/g, '，'),
      (r.improvements || '').replace(/,/g, '，')
    ]
  })
  
  var csvContent = [headers.join(','), ...rows.map(function(r) { return r.join(',') })].join('\n')
  
  // 使用 Blob 下载
  var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  var link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '工作评价_' + new Date().toISOString().split('T')[0] + '.csv'
  link.click()
  URL.revokeObjectURL(link.href)
  
  $page.showMessage({ type: 'success', message: '评价数据已导出' })
}
