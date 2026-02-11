# RendererTree 快速上手

## 最简示例

### 1. 在 rule.json 中添加树组件

```json
{
  "type": "r-tree",
  "dataSource": "myTreeData",
  "props": {
    "node-key": "id"
  }
}
```

### 2. 在 pagedata.json 中准备数据

```json
{
  "myTreeData": [
    {
      "id": 1,
      "label": "一级节点",
      "children": [
        {
          "id": 2,
          "label": "二级节点-1"
        },
        {
          "id": 3,
          "label": "二级节点-2",
          "children": [
            {
              "id": 4,
              "label": "三级节点"
            }
          ]
        }
      ]
    }
  ]
}
```

## 常用配置

### 默认展开所有节点

```json
{
  "type": "r-tree",
  "dataSource": "myTreeData",
  "props": {
    "node-key": "id",
    "default-expand-all": true
  }
}
```

### 高亮当前节点

```json
{
  "type": "r-tree",
  "dataSource": "myTreeData",
  "props": {
    "node-key": "id",
    "highlight-current": true
  }
}
```

### 显示复选框

```json
{
  "type": "r-tree",
  "dataSource": "myTreeData",
  "props": {
    "node-key": "id",
    "show-checkbox": true
  }
}
```

### 手风琴模式（每次只展开一个同级节点）

```json
{
  "type": "r-tree",
  "dataSource": "myTreeData",
  "props": {
    "node-key": "id",
    "accordion": true
  }
}
```

## 事件处理

### 在 rule.json 中绑定事件

```json
{
  "type": "r-tree",
  "dataSource": "myTreeData",
  "props": {
    "node-key": "id"
  },
  "on": {
    "node-click": "handleNodeClick",
    "check": "handleCheck"
  }
}
```

### 在 script.js 中定义事件处理函数

```javascript
function handleNodeClick(data, node, component) {
  console.log('点击的节点数据:', data)
  $data.selectedNode = data
  ElMessage.success(`选中了: ${data.label}`)
}

function handleCheck(data, checkedInfo) {
  console.log('勾选的节点:', data)
  console.log('所有选中的节点:', checkedInfo.checkedNodes)
  $data.checkedNodes = checkedInfo.checkedNodes
}
```

## 完整示例

### rule.json

```json
{
  "type": "el-card",
  "props": {
    "header": "组织架构"
  },
  "children": [
    {
      "type": "r-tree",
      "dataSource": "orgTree",
      "props": {
        "node-key": "id",
        "default-expand-all": false,
        "highlight-current": true,
        "expand-on-click-node": false
      },
      "on": {
        "node-click": "onOrgNodeClick"
      }
    }
  ]
}
```

### pagedata.json

```json
{
  "orgTree": [
    {
      "id": 1,
      "label": "公司",
      "children": [
        {
          "id": 2,
          "label": "研发部",
          "children": [
            { "id": 3, "label": "前端组" },
            { "id": 4, "label": "后端组" }
          ]
        },
        {
          "id": 5,
          "label": "市场部"
        }
      ]
    }
  ],
  "selectedNode": null
}
```

### script.js

```javascript
function onOrgNodeClick(data, node, component) {
  $data.selectedNode = data
  console.log('选中部门:', data.label)
}
```

## 查看完整示例

访问 http://localhost:5174/tree-demo 查看完整的实际应用示例。

## 更多配置

RendererTree 支持所有 Element Plus el-tree 的属性和事件，详见：
https://element-plus.org/zh-CN/component/tree.html
