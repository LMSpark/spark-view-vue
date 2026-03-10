let _pageState = {
  currentNode: null
};

function RenderCurrentNodeInfo() {
  return h('div', { class: 'current-node-info' });
}

function __init__() {
  _flushCurrentNodeInfo();
}

function handleNodeClick(data) {
  _pageState.currentNode = data || null;
  _flushCurrentNodeInfo();
}

function _flushCurrentNodeInfo() {
  const container = $query('.current-node-info');
  if (!container) {
    return;
  }

  const node = _pageState.currentNode;
  if (!node) {
    container.innerHTML = '<p style="margin:0;color:#909399;">点击左侧任意节点，查看该节点的上下文数据。</p>';
    return;
  }

  container.innerHTML = [
    '<div class="node-info-card">',
    '<div><strong>名称：</strong>' + (node.name || '-') + '</div>',
    '<div><strong>类型：</strong>' + (node.typeLabel || '-') + '</div>',
    '<div><strong>负责人：</strong>' + (node.ownerLabel || '-') + '</div>',
    '</div>'
  ].join('');
}