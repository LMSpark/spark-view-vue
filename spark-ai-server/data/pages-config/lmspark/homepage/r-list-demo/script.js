// r-list 全功能演示 — 页面脚本

function __init__() {
  // 产品卡片列表：订阅当前行变化
  const cardsView = $dataSet?.getView('Products', 'cards')
  cardsView?.events.on('currentRowChanged', function (row) {
    if (row) {
      $page.showMessage('选中产品: ' + row.name + ' (¥' + row.price + ')', 'info')
    }
  })

  // 团队成员列表：订阅当前行变化
  const teamView = $dataSet?.getView('TeamMembers', 'default')
  teamView?.events.on('currentRowChanged', function (row) {
    if (row) {
      $page.showMessage('选中成员: ' + row.name + ' — ' + row.role, 'info')
    }
  })
}
