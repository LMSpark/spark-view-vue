<template>
  <div class="stacked-columns-page">
    <div class="page-header">
      <h1>📊 多级表头演示</h1>
      <p>原生HTML表格的多级表头结构和数据展示</p>
    </div>

    <div class="table-container">
      <table class="employee-table">
        <thead>
          <tr>
            <!-- 基本信息列组 -->
            <th colspan="3" class="group-header">基本信息</th>
            <!-- 联系方式列组 -->
            <th colspan="2" class="group-header">联系方式</th>
            <!-- 职位信息列组 -->
            <th colspan="2" class="group-header">职位信息</th>
            <!-- 薪资信息列组 -->
            <th colspan="3" class="group-header">薪资信息</th>
            <!-- 绩效信息列组 -->
            <th colspan="2" class="group-header">绩效信息</th>
          </tr>
          <tr>
            <th>员工ID</th>
            <th>名</th>
            <th>姓</th>
            <th>邮箱</th>
            <th>电话</th>
            <th>职位</th>
            <th>部门</th>
            <th>基本薪资</th>
            <th>奖金</th>
            <th>总薪酬</th>
            <th>评分</th>
            <th>工龄(年)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="employee in paginatedData" :key="employee.EmployeeID">
            <td class="text-right">{{ employee.EmployeeID }}</td>
            <td>{{ employee.FirstName }}</td>
            <td>{{ employee.LastName }}</td>
            <td>{{ employee.Email }}</td>
            <td>{{ employee.Phone }}</td>
            <td>{{ employee.Title }}</td>
            <td>{{ employee.Department }}</td>
            <td class="text-right currency">{{ formatCurrency(employee.Salary) }}</td>
            <td class="text-right currency">{{ formatCurrency(employee.Bonus) }}</td>
            <td class="text-right currency">{{ formatCurrency(employee.TotalCompensation) }}</td>
            <td class="text-center">{{ employee.PerformanceRating }}</td>
            <td class="text-right">{{ employee.YearsOfService }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页控件 -->
    <div class="pagination">
      <button
        :disabled="currentPage === 1"
        class="page-btn"
        @click="goToPage(currentPage - 1)"
      >
        ← 上一页
      </button>

      <span class="page-info">
        第 {{ currentPage }} 页，共 {{ totalPages }} 页
        (每页 {{ pageSize }} 条，共 {{ employeeData.length }} 条记录)
      </span>

      <select v-model="pageSize" class="page-size-select" @change="resetPagination">
        <option :value="5">5 条/页</option>
        <option :value="10">10 条/页</option>
        <option :value="20">20 条/页</option>
        <option :value="50">50 条/页</option>
      </select>

      <button
        :disabled="currentPage === totalPages"
        class="page-btn"
        @click="goToPage(currentPage + 1)"
      >
        下一页 →
      </button>
    </div>

    <div class="data-info">
      <h3>数据说明</h3>
      <ul>
        <li>多级表头展示了员工的完整信息结构</li>
        <li>支持分页显示，支持多种页面大小</li>
        <li>薪资数据使用货币格式显示</li>
        <li>表头分组清晰，便于数据理解</li>
      </ul>
    </div>

    <div class="actions">
      <button class="action-btn primary" @click="refreshData">
        🔄 刷新数据
      </button>
      <button class="action-btn" @click="goBack">
        ← 返回首页
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Spark } from '@spark-view/spark-core'

const router = useRouter()

// 分页状态
const currentPage = ref(1)
const pageSize = ref(5)

const logger = Spark.logger()

// 员工数据
const employeeData = ref([
  {
    EmployeeID: 1,
    FirstName: '张',
    LastName: '三',
    Email: 'zhang.san@company.com',
    Phone: '(010) 1234-5678',
    Title: '高级工程师',
    Department: '技术部',
    Salary: 15000,
    Bonus: 3000,
    TotalCompensation: 18000,
    PerformanceRating: '优秀',
    YearsOfService: 5
  },
  {
    EmployeeID: 2,
    FirstName: '李',
    LastName: '四',
    Email: 'li.si@company.com',
    Phone: '(010) 1234-5679',
    Title: '产品经理',
    Department: '产品部',
    Salary: 18000,
    Bonus: 5000,
    TotalCompensation: 23000,
    PerformanceRating: '良好',
    YearsOfService: 3
  },
  {
    EmployeeID: 3,
    FirstName: '王',
    LastName: '五',
    Email: 'wang.wu@company.com',
    Phone: '(010) 1234-5680',
    Title: '设计师',
    Department: '设计部',
    Salary: 12000,
    Bonus: 2000,
    TotalCompensation: 14000,
    PerformanceRating: '优秀',
    YearsOfService: 4
  },
  {
    EmployeeID: 4,
    FirstName: '赵',
    LastName: '六',
    Email: 'zhao.liu@company.com',
    Phone: '(010) 1234-5681',
    Title: '测试工程师',
    Department: '质量部',
    Salary: 13000,
    Bonus: 2500,
    TotalCompensation: 15500,
    PerformanceRating: '良好',
    YearsOfService: 2
  },
  {
    EmployeeID: 5,
    FirstName: '孙',
    LastName: '七',
    Email: 'sun.qi@company.com',
    Phone: '(010) 1234-5682',
    Title: '运维工程师',
    Department: '运维部',
    Salary: 14000,
    Bonus: 2800,
    TotalCompensation: 16800,
    PerformanceRating: '优秀',
    YearsOfService: 6
  },
  {
    EmployeeID: 6,
    FirstName: '周',
    LastName: '八',
    Email: 'zhou.ba@company.com',
    Phone: '(010) 1234-5683',
    Title: '前端工程师',
    Department: '技术部',
    Salary: 16000,
    Bonus: 4000,
    TotalCompensation: 20000,
    PerformanceRating: '优秀',
    YearsOfService: 3
  },
  {
    EmployeeID: 7,
    FirstName: '吴',
    LastName: '九',
    Email: 'wu.jiu@company.com',
    Phone: '(010) 1234-5684',
    Title: '后端工程师',
    Department: '技术部',
    Salary: 17000,
    Bonus: 4500,
    TotalCompensation: 21500,
    PerformanceRating: '良好',
    YearsOfService: 4
  },
  {
    EmployeeID: 8,
    FirstName: '郑',
    LastName: '十',
    Email: 'zheng.shi@company.com',
    Phone: '(010) 1234-5685',
    Title: '项目经理',
    Department: '项目部',
    Salary: 20000,
    Bonus: 6000,
    TotalCompensation: 26000,
    PerformanceRating: '优秀',
    YearsOfService: 7
  }
])

// 计算属性：分页数据
const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return employeeData.value.slice(start, end)
})

// 计算属性：总页数
const totalPages = computed(() => {
  return Math.ceil(employeeData.value.length / pageSize.value)
})

// 格式化货币
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY'
  }).format(amount)
}

// 分页方法
const goToPage = (page: number) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

const resetPagination = () => {
  currentPage.value = 1
}

const refreshData = () => {
  // 模拟数据刷新
  employeeData.value = [...employeeData.value]
  resetPagination()
  const logger = getLogger()
  logger.info('数据已刷新')
}

const goBack = () => {
  router.push('/')
}

onMounted(() => {
  console.log('原生多级表头组件已初始化')
})
</script>

<style scoped>
.stacked-columns-page {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 2rem;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
}

.page-header h1 {
  font-size: 2.5rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.page-header p {
  font-size: 1.1rem;
  color: #7f8c8d;
}

.table-container {
  max-width: 1400px;
  margin: 0 auto 2rem;
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
  overflow-x: auto;
}

.employee-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.employee-table th,
.employee-table td {
  padding: 0.75rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid #ecf0f1;
}

.employee-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
  position: sticky;
  top: 0;
  z-index: 10;
}

.group-header {
  background: #e3f2fd !important;
  color: #1565c0;
  font-weight: 700;
  text-align: center;
  border-right: 2px solid #bbdefb;
}

.employee-table tbody tr:hover {
  background: #f8f9fa;
}

.employee-table tbody tr:nth-child(even) {
  background: #fafbfc;
}

.text-right {
  text-align: right;
}

.text-center {
  text-align: center;
}

.currency {
  font-family: 'Courier New', monospace;
  color: #27ae60;
  font-weight: 500;
}

/* 分页样式 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin: 2rem 0;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.page-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  color: #333;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  background: #f8f9fa;
  border-color: #bbb;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: #666;
  font-size: 0.9rem;
}

.page-size-select {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.data-info {
  max-width: 1200px;
  margin: 0 auto 3rem;
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
}

.data-info h3 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

.data-info ul {
  list-style: none;
  padding: 0;
}

.data-info li {
  padding: 0.5rem 0;
  color: #5a6c7d;
  border-bottom: 1px solid #ecf0f1;
}

.data-info li:last-child {
  border-bottom: none;
}

.actions {
  text-align: center;
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.action-btn {
  padding: 0.75rem 2rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.primary {
  background: #3498db;
  color: white;
}

.action-btn.primary:hover {
  background: #2980b9;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .stacked-columns-page {
    padding: 1rem;
  }

  .employee-table {
    font-size: 0.8rem;
  }

  .employee-table th,
  .employee-table td {
    padding: 0.5rem 0.25rem;
  }

  .pagination {
    flex-direction: column;
    gap: 0.5rem;
  }

  .actions {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
    max-width: 200px;
  }
}
</style>