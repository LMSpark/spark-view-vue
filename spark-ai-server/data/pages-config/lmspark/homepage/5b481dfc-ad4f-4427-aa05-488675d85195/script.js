function __init__() {
  console.log('页面初始化...');

  const ds = $page.dataSet;
  if (!ds) return;

  // 订单视图已配置 autoLoad，运行时会自动加载
  console.log('OrderSystemDataSet 已初始化');
}
