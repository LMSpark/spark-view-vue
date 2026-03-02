/**
 * Form-Create API 实战演示
 * 展示 form-create 的各种 API 用法
 */

// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData

// 添加日志
function addLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString()
  _pageState.apiLog.unshift({ time: timestamp, message, type })
  if (_pageState.apiLog.length > 50) _pageState.apiLog = _pageState.apiLog.slice(0, 50)
  console.log(`[${timestamp}] ${message}`)
}

/**
 * 获取所有表单值
 */
function handleGetAllValues() {
  const api = $api
  if (!api) {
    $page.showMessage('API 未初始化', 'error')
    return
  }
  
  const values = api.formData()
  addLog(`📊 获取所有值: ${JSON.stringify(values)}`, 'success')
  $page.showMessage('已输出到控制台')
  console.log('表单数据:', values)
}

/**
 * 批量设置值
 */
function handleSetValues() {
  const api = $api
  if (!api) return
  
  api.setValue({
    username: 'demo_user',
    email: 'demo@example.com',
    phone: '13800138000',
    description: '这是通过 API 设置的值'
  })
  
  addLog('✏️ 批量设置值成功', 'success')
  $page.showMessage('已批量设置表单值')
}

/**
 * 验证表单
 */
function handleValidate() {
  const api = $api
  if (!api) return
  
  addLog('🔍 开始验证表单...', 'info')
  
  api.validate((valid) => {
    if (valid) {
      addLog('✅ 表单验证通过', 'success')
      $page.showMessage('表单验证通过')
    } else {
      addLog('❌ 表单验证失败', 'error')
      $page.showMessage('表单验证失败', 'error')
    }
  })
}

/**
 * 重置表单
 */
function handleReset() {
  const api = $api
  if (!api) return
  
  api.resetFields()
  addLog('🔄 表单已重置', 'info')
  $page.showMessage('表单已重置')
}

/**
 * 清除验证状态
 */
function handleClearValidate() {
  const api = $api
  if (!api) return
  
  api.clearValidateState()
  addLog('🧹 验证状态已清除', 'info')
  $page.showMessage('验证状态已清除')
}

/**
 * 切换高级选项
 */
function handleToggleAdvanced() {
  _pageState.showAdvanced = !_pageState.showAdvanced
  addLog(`🔧 高级选项: ${_pageState.showAdvanced ? '显示' : '隐藏'}`, 'info')
  $page.showMessage(`高级选项已${_pageState.showAdvanced ? '显示' : '隐藏'}`, 'info')
}

/**
 * 禁用/启用邮箱字段
 */
let emailDisabled = false
function handleDisableEmail() {
  const api = $api
  if (!api) return
  
  emailDisabled = !emailDisabled
  
  // 方式1：使用 disabled() 方法
  api.disabled(emailDisabled, 'email')
  
  // 方式2：使用 updateRule() 方法
  // api.updateRule('email', {
  //   props: { disabled: emailDisabled }
  // })
  
  addLog(`🔒 邮箱字段: ${emailDisabled ? '已禁用' : '已启用'}`, 'warning')
  $page.showMessage(`邮箱字段已${emailDisabled ? '禁用' : '启用'}`, 'info')
}

/**
 * 隐藏/显示电话字段
 */
let phoneHidden = false
function handleHidePhone() {
  const api = $api
  if (!api) return
  
  phoneHidden = !phoneHidden
  api.hidden(phoneHidden, 'phone')
  
  addLog(`👁️ 电话字段: ${phoneHidden ? '已隐藏' : '已显示'}`, 'warning')
  $page.showMessage(`电话字段已${phoneHidden ? '隐藏' : '显示'}`, 'info')
}

/**
 * 更新占位符文本
 */
function handleUpdatePlaceholder() {
  const api = $api
  if (!api) return
  
  const timestamp = new Date().toLocaleTimeString()
  
  api.updateRule('username', {
    props: {
      placeholder: `更新于 ${timestamp}`
    }
  })
  
  addLog(`📝 已更新用户名占位符: ${timestamp}`, 'success')
  $page.showMessage('占位符已更新')
}

/**
 * 用户类型变化（动态显示/隐藏字段）
 */
function handleUserTypeChange(userType) {
  const api = $api
  if (!api) return
  
  addLog(`🔄 用户类型切换: ${userType}`, 'info')
  
  if (userType === 'company') {
    // 企业用户：显示公司信息
    api.hidden(false, ['companyName_field', 'taxNumber_field'])
    api.hidden(true, 'personalId_field')
    
    addLog('👔 显示企业字段，隐藏个人字段', 'success')
  } else {
    // 个人用户：显示身份证号
    api.hidden(true, ['companyName_field', 'taxNumber_field'])
    api.hidden(false, 'personalId_field')
    
    addLog('👤 显示个人字段，隐藏企业字段', 'success')
  }
}

/**
 * 自定义渲染：API 调用日志
 */
function RenderApiLog() {
  const logs = _pageState.apiLog || []
  
  if (logs.length === 0) {
    return h('div', { style: 'color: #999; textAlign: center; padding: 20px' }, '暂无日志')
  }
  
  return h('div', logs.map(log => {
    const colors = {
      info: '#409EFF',
      success: '#67C23A',
      warning: '#E6A23C',
      error: '#F56C6C'
    }
    
    return h('div', {
      style: {
        marginBottom: '8px',
        padding: '8px',
        background: '#fff',
        borderRadius: '4px',
        borderLeft: `3px solid ${colors[log.type] || colors.info}`
      }
    }, [
      h('span', { style: 'color: #999; marginRight: 10px' }, log.time),
      h('span', { style: { color: colors[log.type] || colors.info } }, log.message)
    ])
  }))
}

/**
 * 初始化
 */
function __init__() {
  addLog('🚀 页面初始化完成', 'success')
  addLog('💡 点击上方按钮测试 API', 'info')
  
  const api = $api
  if (api) {
    // 监听字段值变化
    api.on('change', (field, value) => {
      addLog(`🔔 字段 "${field}" 变化: ${JSON.stringify(value)}`, 'info')
    })
    
    addLog('✅ 已注册 change 事件监听', 'success')
  }
}
