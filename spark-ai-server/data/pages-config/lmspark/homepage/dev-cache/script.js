/* ── 开发缓存管理 ── */

var _logs = []
var _cacheStats = { size: 0, keys: [] }

function _getDevTools() {
  // window 被沙箱拦截，通过 DOM 元素间接获取真实 window
  var el = $el()
  if (el && el.ownerDocument && el.ownerDocument.defaultView) {
    return el.ownerDocument.defaultView.__sparkDev || {}
  }
  return {}
}

function _addLog(type, message) {
  var now = new Date()
  var ts = now.getHours().toString().padStart(2, '0') + ':' +
           now.getMinutes().toString().padStart(2, '0') + ':' +
           now.getSeconds().toString().padStart(2, '0')
  _logs.unshift({ ts: ts, type: type, message: message })
  if (_logs.length > 50) _logs.length = 50
}

function _refreshStats() {
  var dev = _getDevTools()
  if (dev.getCacheStats) {
    _cacheStats = dev.getCacheStats()
  }
}

function __init__() {
  _refreshStats()
}

/* ── 操作函数 ── */

function handleClearAll() {
  var dev = _getDevTools()
  if (!dev.clearAllCache) {
    $page.showMessage('缓存管理未就绪，请刷新页面', 'warning')
    return
  }
  var stats = dev.clearAllCache()
  _addLog('success', '已清除全部页面配置缓存（' + stats.size + ' 条记录）')
  _refreshStats()
  $page.showMessage('✅ 全部缓存已清除', 'success')
}

function handleClearPage() {
  $page.showPrompt('输入要清除的 pageId', {
    inputValue: '',
    inputPlaceholder: '例如: dataset-demo'
  }).then(function(result) {
    if (!result || !result.value) return
    var pageId = result.value.trim()
    if (!pageId) return

    // 直接调用全局 clearPageCache
    var dev = _getDevTools()
    if (dev.clearAllCache) {
      _addLog('info', '清除页面缓存: ' + pageId)
    }

    // 通过 localStorage 直接清除（兜底方案，始终可用）
    var prefix = 'spark_page_'
    var files = ['rule.json', 'pagedata.json', 'script.js', 'style.css']
    var cleared = 0
    files.forEach(function(file) {
      var base = prefix + '/' + pageId + '/' + file
      ;[base, base + ':raw', base + ':transform'].forEach(function(key) {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key)
          cleared++
        }
      })
    })
    _addLog('success', '已清除 ' + pageId + ' 缓存（' + cleared + ' 条 localStorage 记录）')
    _refreshStats()
    $page.showMessage('✅ 已清除 ' + pageId + ' 缓存', 'success')
  }).catch(function() {})
}

function handleRefreshRoutes() {
  var dev = _getDevTools()
  if (!dev.refreshRoutes) {
    $page.showMessage('路由管理未就绪', 'warning')
    return
  }
  dev.refreshRoutes().then(function(routes) {
    _addLog('success', '路由已刷新，共 ' + routes.length + ' 条')
    _refreshStats()
    $page.showMessage('✅ 路由已刷新', 'success')
  }).catch(function(err) {
    _addLog('error', '路由刷新失败: ' + err)
    $page.showMessage('❌ 路由刷新失败', 'error')
  })
}

function handleRefreshNav() {
  var dev = _getDevTools()
  if (!dev.reloadNavigation) {
    $page.showMessage('导航管理未就绪', 'warning')
    return
  }
  dev.reloadNavigation().then(function() {
    _addLog('success', '导航菜单已重新加载')
    $page.showMessage('✅ 导航菜单已刷新', 'success')
  }).catch(function(err) {
    _addLog('error', '导航刷新失败: ' + err)
    $page.showMessage('❌ 导航刷新失败', 'error')
  })
}

/* ── Render 函数 ── */

function RenderClearAllButton() {
  return h('el-button', {
    type: 'danger',
    onClick: handleClearAll
  }, '🗑️ 清除全部缓存')
}

function RenderClearPageButton() {
  return h('el-button', {
    type: 'warning',
    onClick: handleClearPage
  }, '📄 清除指定页面')
}

function RenderRefreshRoutesButton() {
  return h('el-button', {
    type: 'primary',
    onClick: handleRefreshRoutes
  }, '🔄 刷新路由')
}

function RenderRefreshNavButton() {
  return h('el-button', {
    type: 'success',
    onClick: handleRefreshNav
  }, '🧭 刷新导航')
}

function RenderCacheStats() {
  var stats = _cacheStats
  var children = []

  children.push(
    h('div', { style: 'display:flex;gap:24px;marginBottom:12px' }, [
      h('div', { style: 'background:#f0f9eb;padding:12px 20px;borderRadius:8px;flex:1;textAlign:center' }, [
        h('div', { style: 'fontSize:28px;fontWeight:bold;color:#67c23a' }, String(stats.size)),
        h('div', { style: 'color:#909399;fontSize:13px;marginTop:4px' }, '内存缓存条目')
      ]),
      h('div', { style: 'background:#ecf5ff;padding:12px 20px;borderRadius:8px;flex:1;textAlign:center' }, [
        h('div', { style: 'fontSize:28px;fontWeight:bold;color:#409eff' }, String(_countLocalStorage())),
        h('div', { style: 'color:#909399;fontSize:13px;marginTop:4px' }, 'localStorage 条目')
      ])
    ])
  )

  if (stats.keys.length > 0) {
    children.push(
      h('div', { style: 'marginTop:8px' }, [
        h('div', { style: 'color:#606266;fontSize:13px;marginBottom:6px;fontWeight:500' }, '缓存键列表：'),
        h('div', {
          style: 'maxHeight:200px;overflow:auto;background:#fafafa;padding:8px 12px;borderRadius:6px;fontSize:12px;fontFamily:monospace;lineHeight:1.8'
        }, stats.keys.map(function(key) {
          return h('div', { style: 'color:#606266' }, key)
        }))
      ])
    )
  }

  return h('div', children)
}

function _countLocalStorage() {
  var count = 0
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i)
    if (key && key.indexOf('spark_page_') === 0) count++
  }
  return count
}

function RenderLog() {
  if (_logs.length === 0) {
    return h('div', { style: 'color:#909399;fontSize:13px;padding:12px 0' }, '暂无操作记录')
  }

  return h('div', {
    style: 'maxHeight:300px;overflow:auto'
  }, _logs.map(function(log) {
    var colors = { success: '#67c23a', error: '#f56c6c', info: '#409eff', warning: '#e6a23c' }
    var color = colors[log.type] || '#909399'
    return h('div', {
      style: 'display:flex;gap:8px;padding:6px 0;borderBottom:1px solid #f0f0f0;fontSize:13px'
    }, [
      h('span', { style: 'color:#c0c4cc;flexShrink:0;fontFamily:monospace' }, log.ts),
      h('span', { style: 'width:8px;height:8px;borderRadius:50%;background:' + color + ';flexShrink:0;marginTop:6px' }),
      h('span', { style: 'color:#303133' }, log.message)
    ])
  }))
}
