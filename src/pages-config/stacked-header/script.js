import { $data } from '@/utils/page-helpers/common.js';

/**
 * TreeView 节点点击处理
 */
export function nodeCheck(args) {
  const checkedNode = [args.node];
  const treeObj = document.getElementById('treeview')?.ej2_instances?.[0];
  
  if (!treeObj) return;

  if (args.event.target.classList.contains('e-fullrow') || args.event.key === 'Enter') {
    const getNodeDetails = treeObj.getNode(args.node);
    if (getNodeDetails.isChecked === 'true') {
      treeObj.uncheckAll(checkedNode);
    } else {
      treeObj.checkAll(checkedNode);
    }
  }
}

/**
 * 单元格查询信息回调
 */
export function queryCellInfo(args) {
  if (args.column.field === 'Status') {
    if (args.data['Status'] === 'Delivered') {
      args.cell.classList.remove('e-inprogress');
      args.cell.classList.add('e-delivered');
    } else {
      args.cell.classList.remove('e-delivered');
      args.cell.classList.add('e-inprogress');
    }
  }
}

/**
 * 处理 TreeView 数据结构
 */
export function dataProcess(args) {
  const parentNodes = [
    { id: 1, name: 'Order Details', hasChild: true, expanded: true },
    { id: 2, name: 'Shipping Details', hasChild: true, expanded: true },
    { id: 3, name: 'Delivery Status', hasChild: true, expanded: true },
  ];

  let treeData = [];
  
  if (args.columns && args.columns.length) {
    treeData = args.columns.map((column) => {
      let parentId;
      switch (column.field) {
        case 'OrderID':
        case 'OrderDate':
          parentId = 1;
          break;
        case 'ShipCountry':
        case 'Freight':
          parentId = 2;
          break;
        case 'Status':
        case 'Feedback':
          parentId = 3;
          break;
        default:
          break;
      }
      return {
        id: column.uid,
        name: column.headerText,
        pid: parentId,
        isChecked: column.visible
      };
    });

    const uniquePids = [];
    treeData.forEach((item) => {
      if (uniquePids.indexOf(item.pid) === -1) {
        uniquePids.push(item.pid);
      }
    });

    const filteredParents = parentNodes.filter((parent) => 
      uniquePids.indexOf(parent.id) !== -1
    );
    treeData.push(...filteredParents);
  } else {
    treeData = [];
  }

  const fields = { 
    dataSource: treeData, 
    id: 'id', 
    parentID: 'pid', 
    text: 'name', 
    hasChildren: 'hasChild' 
  };
  
  return fields;
}

/**
 * 关闭列选择器对话框
 */
export function columnChooserClose() {
  const gridInstance = document.getElementById('gridInstance')?.ej2_instances?.[0];
  if (gridInstance) {
    gridInstance.columnChooserModule.hideDialog();
  }
}

/**
 * 提交列选择器更改
 */
export function columnChooserSubmit() {
  const checkedElements = [];
  const uncheckedElements = [];
  
  const gridInstance = document.getElementById('gridInstance')?.ej2_instances?.[0];
  const treeObj = document.getElementById('treeview')?.ej2_instances?.[0];
  
  if (!gridInstance || !treeObj) return;

  let showColumns = gridInstance.getVisibleColumns()
    .filter((column) => column.showInColumnChooser === true)
    .map((col) => col.headerText);

  const treeItems = document.querySelectorAll('.e-list-item');
  treeItems.forEach(item => {
    const itemDetails = treeObj.getNode(item);
    if (!itemDetails.hasChildren) {
      if (item.getAttribute('aria-checked') === 'true') {
        checkedElements.push(itemDetails.text);
      } else {
        uncheckedElements.push(itemDetails.text);
      }
    }
  });

  showColumns = showColumns.filter((col) => uncheckedElements.indexOf(col) === -1);
  
  checkedElements.forEach(item => {
    if (!showColumns.includes(item)) {
      showColumns.push(item);
    }
  });

  const columnsToUpdate = { 
    visibleColumns: showColumns, 
    hiddenColumns: uncheckedElements 
  };
  
  gridInstance.columnChooserModule.changeColumnVisibility(columnsToUpdate);
}
