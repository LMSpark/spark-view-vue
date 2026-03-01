// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

let selectedUser = null;

/**
 * 处理用户行选择
 */
function handleUserRowChange(currentRow) {
  selectedUser = currentRow;
  if (currentRow) {
    console.log('✅ 选中用户:', currentRow);
  }
}

/**
 * 添加新用户 - 低代码：直接操作数组，UI自动更新
 */
async function handleAddUser() {
  try {
    const { value: name } = await ElMessageBox.prompt('请输入用户名', '添加用户', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /.+/,
      inputErrorMessage: '用户名不能为空'
    });

    const { value: email } = await ElMessageBox.prompt('请输入邮箱', '添加用户', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /^.+@.+\..+$/,
      inputErrorMessage: '请输入有效的邮箱地址'
    });

    const dataSet = $dataSet;
    const userTable = dataSet.getTable('Users');
    
    const maxId = Math.max(...userTable.rows.map(r => r.id), 0);
    const newUser = { id: maxId + 1, name, email };

    // 低代码：通过 DataView CRUD 操作，内核自动通知订阅者，UI 自动更新
    const view = dataSet.getView('Users', 'default');
    view.create(newUser);
    
    ElMessage.success(`✅ 用户添加成功: ${name}`);
  } catch (error) {
    if (error !== 'cancel') {
      console.error('添加用户失败:', error);
      ElMessage.error('添加用户失败');
    }
  }
}

/**
 * 批量修改用户ID - 低代码：内核自动处理级联更新
 */
async function handleUpdateUserIdBatch() {
  try {
    const { value: offset } = await ElMessageBox.prompt(
      '输入要增加的ID偏移量（例如：100），订单的userId会自动级联更新',
      '批量修改用户ID',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /^\d+$/,
        inputErrorMessage: '请输入正整数'
      }
    );

    const dataSet = $dataSet;
    const userTable = dataSet.getTable('Users');
    const ordersTable = dataSet.getTable('Orders');
    const offsetNum = parseInt(offset);
    
    // 存储旧ID→新ID映射
    const idMapping = new Map();
    
    // 低代码：先更新用户ID
    userTable.rows.forEach(user => {
      const oldId = user.id;
      const newId = oldId + offsetNum;
      idMapping.set(oldId, newId);
      user.id = newId;
    });
    
    // 手动级联：更新 Orders 中的 userId 外键引用
    ordersTable.rows.forEach(order => {
      if (idMapping.has(order.userId)) {
        order.userId = idMapping.get(order.userId);
      }
    });
    
    // 通知 UI 刷新：replaceRows([...rows]) 触发 rowsChanged 事件
    const usersView = dataSet.getView('Users', 'default');
    const ordersView = dataSet.getView('Orders', 'default');
    usersView?.replaceRows([...userTable.rows]);
    ordersView?.replaceRows([...ordersTable.rows]);
    
    ElMessage.success(`✅ 已批量更新 ${userTable.rows.length} 个用户ID，订单已手动级联更新`);
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量更新失败:', error);
      ElMessage.error('批量更新失败');
    }
  }
}

/**
 * 删除选中用户 - 低代码：内核自动处理级联删除
 */
async function handleDeleteSelectedUser() {
  if (!selectedUser) {
    ElMessage.warning('请先点击表格中的一行选择用户');
    return;
  }

  try {
    const dataSet = $dataSet;
    const Users = dataSet.getTable('Users');
    const Orders = dataSet.getTable('Orders');
    const OrderItems = dataSet.getTable('OrderItems');
    
    // 统计关联数据（仅用于提示）
    const relatedOrders = Orders.rows.filter(o => o.userId === selectedUser.id);
    const relatedOrderIds = relatedOrders.map(o => o.id);
    const relatedOrderItems = OrderItems.rows.filter(item => 
      relatedOrderIds.includes(item.orderId)
    );

    await ElMessageBox.confirm(
      `确定要删除用户 "${selectedUser.name}" 吗？\n\n⚠️ 这将会级联删除：\n` +
      `• ${relatedOrders.length} 个订单\n` +
      `• ${relatedOrderItems.length} 个订单明细`,
      '危险操作',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    const index = Users.rows.findIndex(u => u.id === selectedUser.id);
    
    if (index !== -1) {
      // 级联删除：手动处理子表（从最深层开始）
      
      // 1. 找到关联的 Order ID
      const relatedOrderIds = Orders.rows.filter(o => o.userId === selectedUser.id).map(o => o.id);
      
      // 2. 删除 OrderItems（子表先删）
      const remainingItems = OrderItems.rows.filter(item => !relatedOrderIds.includes(item.orderId));
      OrderItems.rows.splice(0, OrderItems.rows.length, ...remainingItems);
      
      // 3. 删除 Orders
      const remainingOrders = Orders.rows.filter(o => o.userId !== selectedUser.id);
      Orders.rows.splice(0, Orders.rows.length, ...remainingOrders);
      
      // 4. 删除 User
      Users.rows.splice(index, 1);
      
      // 5. 通知所有视图刷新：replaceRows 触发 rowsChanged 事件
      dataSet.getView('Users', 'default')?.replaceRows([...Users.rows]);
      dataSet.getView('Orders', 'default')?.replaceRows([...Orders.rows]);
      dataSet.getView('OrderItems', 'default')?.replaceRows([...OrderItems.rows]);
      
      ElMessage.success(
        `✅ 用户删除成功！\n级联删除了 ${relatedOrders.length} 个订单和 ${relatedOrderItems.length} 个明细`
      );
      selectedUser = null;
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error);
      ElMessage.error('删除失败');
    }
  }
}

// 页面脚本加载完成
console.log('📦 cascade-demo 脚本已加载（低代码模式）');



