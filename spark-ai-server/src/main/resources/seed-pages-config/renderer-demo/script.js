// Renderer Demo 页面脚本

function __init__() {
  console.log('✅ Renderer Demo 初始化完成')
  if ($dataSet) {
    var table = $dataSet.getTable('users')
    console.log('📊 users table:', table ? 'OK (' + table.rows.length + ' rows)' : 'NULL')
    var view = $dataSet.getView('users', 'default')
    console.log('👁️ users view:', view ? 'OK (' + view.rows.length + ' rows)' : 'NULL')
  } else {
    console.warn('⚠️ $dataSet is null!')
  }
}
