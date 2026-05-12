// ============================================================
// 产品目录管理系统 - 交互脚本
// ============================================================

// ---------- 分类切换联动 ----------
function onCategoryChange(row) {
  if (!row) return
  const productsView = $dataSet?.getView('Products', 'default')
  if (!productsView) return
  // 按选中分类过滤产品
  const allProducts = productsView.rows || []
  const filtered = allProducts.filter(p => p.categoryId === row.id)
  // 直接替换视图行集
  productsView.rows = filtered
}

// ---------- 新增产品 ----------
function onProductAdd() {
  const categoriesView = $dataSet?.getView('Categories', 'default')
  const currentCategory = categoriesView?.currentRow
  if (!currentCategory) {
    $page.showMessage({ type: 'warning', message: '请先在分类列表中选择一个分类' })
    return
  }

  $page.showPrompt({
    title: '新增产品',
    content: `
      <div style="display:grid;gap:12px">
        <input id="dlg-name" placeholder="产品名称" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px" />
        <input id="dlg-price" type="number" placeholder="价格" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px" />
        <input id="dlg-desc" placeholder="产品描述" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px" />
        <input id="dlg-tags" placeholder="标签（逗号分隔）" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px" />
        <select id="dlg-status" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px">
          <option value="上架">上架</option>
          <option value="下架">下架</option>
          <option value="待审核">待审核</option>
        </select>
      </div>
    `,
    confirmButtonText: '确定添加',
    cancelButtonText: '取消'
  }).then(() => {
    const name = document.getElementById('dlg-name')?.value?.trim()
    const price = parseFloat(document.getElementById('dlg-price')?.value)
    const description = document.getElementById('dlg-desc')?.value?.trim()
    const tags = document.getElementById('dlg-tags')?.value?.trim()
    const status = document.getElementById('dlg-status')?.value || '上架'

    if (!name || isNaN(price)) {
      $page.showMessage({ type: 'error', message: '产品名称和价格为必填项' })
      return
    }

    const newId = 'p' + String(Date.now()).slice(-6)
    const productsView = $dataSet?.getView('Products', 'default')
    if (!productsView) return

    productsView.appendRow({
      id: newId,
      categoryId: currentCategory.id,
      name,
      price,
      description: description || '',
      tags: tags || '',
      status,
      image: '',
      createdAt: new Date().toISOString().slice(0, 10)
    })

    $page.showMessage({ type: 'success', message: `产品「${name}」已添加` })
  }).catch(() => {})
}

// ---------- 编辑产品 ----------
function onProductEdit(row) {
  if (!row) {
    $page.showMessage({ type: 'warning', message: '请先选择要编辑的产品' })
    return
  }

  $page.showPrompt({
    title: '编辑产品',
    content: `
      <div style="display:grid;gap:12px">
        <input id="dlg-name" value="${row.name}" placeholder="产品名称" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px" />
        <input id="dlg-price" type="number" value="${row.price}" placeholder="价格" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px" />
        <input id="dlg-desc" value="${row.description || ''}" placeholder="产品描述" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px" />
        <input id="dlg-tags" value="${row.tags || ''}" placeholder="标签（逗号分隔）" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px" />
        <select id="dlg-status" style="padding:8px;border:1px solid #d9d9d9;border-radius:6px">
          <option value="上架" ${row.status === '上架' ? 'selected' : ''}>上架</option>
          <option value="下架" ${row.status === '下架' ? 'selected' : ''}>下架</option>
          <option value="待审核" ${row.status === '待审核' ? 'selected' : ''}>待审核</option>
        </select>
      </div>
    `,
    confirmButtonText: '保存修改',
    cancelButtonText: '取消'
  }).then(() => {
    const name = document.getElementById('dlg-name')?.value?.trim()
    const price = parseFloat(document.getElementById('dlg-price')?.value)
    const description = document.getElementById('dlg-desc')?.value?.trim()
    const tags = document.getElementById('dlg-tags')?.value?.trim()
    const status = document.getElementById('dlg-status')?.value || '上架'

    if (!name || isNaN(price)) {
      $page.showMessage({ type: 'error', message: '产品名称和价格为必填项' })
      return
    }

    const productsView = $dataSet?.getView('Products', 'default')
    if (!productsView) return

    productsView.updateRowById(row.id, {
      name,
      price,
      description: description || '',
      tags: tags || '',
      status
    })

    $page.showMessage({ type: 'success', message: `产品「${name}」已更新` })
  }).catch(() => {})
}

// ---------- 删除产品 ----------
function onProductDelete(row) {
  if (!row) {
    $page.showMessage({ type: 'warning', message: '请先选择要删除的产品' })
    return
  }

  $page.showConfirm({
    title: '确认删除',
    message: `确定要删除产品「${row.name}」吗？此操作不可恢复。`,
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const productsView = $dataSet?.getView('Products', 'default')
    if (!productsView) return

    productsView.deleteRowById(row.id)
    $page.showMessage({ type: 'success', message: `产品「${row.name}」已删除` })
  }).catch(() => {})
}
