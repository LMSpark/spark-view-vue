// Tree Demo Page Script
// 树组件演示页面的交互逻辑

// 获取当前选中节点
function getCurrentNode() {
  const tree = spark.ref('tree-demo');
  if (tree) {
    const node = tree.getCurrentNode();
    if (node) {
      ElMessage.info(`当前选中: ${node.name}（类型: ${node.type}，状态: ${node.status}）`);
    } else {
      ElMessage.warning('未选中任何节点');
    }
  }
}

// 获取勾选节点
function getCheckedNodes() {
  const tree = spark.ref('tree-demo');
  if (tree) {
    const nodes = tree.getCheckedNodes();
    if (nodes.length > 0) {
      const names = nodes.map(n => n.name).join(', ');
      ElMessage.info(`勾选节点 (${nodes.length}个): ${names}`);
    } else {
      ElMessage.warning('未勾选任何节点');
    }
  }
}

// 节点点击事件
function handleNodeClick(data) {
  ElMessage.info(`点击节点: ${data.name}`);
}

// 节点展开事件
function handleNodeExpand(data) {
  console.log('展开节点:', data.name);
}

// 节点折叠事件
function handleNodeCollapse(data) {
  console.log('折叠节点:', data.name);
}
