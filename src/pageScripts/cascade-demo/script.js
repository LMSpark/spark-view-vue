import { $data, $dataSetManager } from '../common.js';
import { ElMessage, ElMessageBox } from 'element-plus';

let selectedUser = null;

/**
 * 处理用户行选择
 */
export function handleUserRowChange(currentRow) {
  selectedUser = currentRow;
  if (currentRow) {
    console.log('✅ 选中用户:', currentRow);
  }
}

/**
 * 添加新用户 - 低代码：直接操作数组，UI自动更新
 */
export async function handleAddUser() {
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

    const pageData = $data();
    const userTable = pageData.dataset.tables.Users;
    
    const maxId = Math.max(...userTable.rows.map(r => r.id), 0);
    const newUser = { id: maxId + 1, name, email };

    // 低代码：直接操作，内核通知订阅者，UI自动更新
    userTable.rows.push(newUser);
    $dataSetManager().notifySubscribers('Users'); // 手动触发通知
    
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
export async function handleUpdateUserIdBatch() {
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

    const pageData = $data();
    const manager = $dataSetManager();
    const userTable = pageData.dataset.tables.Users;
    const offsetNum = parseInt(offset);
    
    // 低代码：遍历更新，内核自动级联
    userTable.rows.forEach(user => {
      const oldValues = { ...user };
      user.id += offsetNum;
      manager.cascadeUpdate('Users', user, oldValues);
    });
    
    ElMessage.success(`✅ 已批量更新 ${userTable.rows.length} 个用户ID，订单已自动级联更新`);
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
export async function handleDeleteSelectedUser() {
  if (!selectedUser) {
    ElMessage.warning('请先点击表格中的一行选择用户');
    return;
  }

  try {
    const pageData = $data();
    const manager = $dataSetManager();
    const { Users, Orders, OrderItems } = pageData.dataset.tables;
    
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
      // 低代码：调用内核的级联删除，然后删除父行
      manager.cascadeDelete('Users', selectedUser);
      Users.rows.splice(index, 1);
      
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
