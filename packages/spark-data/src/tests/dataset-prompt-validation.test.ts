/**
 * DataSet JSON 提示词验证测试
 *
 * 把 docs/guides/DATASET_JSON_PROMPT.md 中的所有完整验证案例 JSON
 * 用 DataSet.fromPageData() 实例化，自动验证：
 *  1. 能成功实例化（不抛出错误）
 *  2. 视图（DataView）行数据正确
 *  3. 内存级联正确（setCurrentRow → 子视图过滤）
 *  4. 计算列正确（单行表达式 / 多语句 / 子表聚合函数）
 *  5. 视图聚合（summaryRow）正确
 *
 * 本文件是提示词质量门：任何提示词修改必须保证此文件全部通过。
 */

import { describe, it, expect } from 'vitest'
import { DataSet } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'

/** 读取行字段（绕过 noPropertyAccessFromIndexSignature） */
const f = (row: IDataRow | undefined | null, field: string): unknown => row?.[field]

// ─────────────────────────────────────────────────────────────────────────────
// 共享工具
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从完整 pagedata.json 结构（含 dataset 顶层包装）实例化 DataSet。
 * 这是提示词最终输出的 JSON 的正确消费方式。
 */
function fromPromptJson(json: Record<string, unknown>): DataSet {
  return DataSet.fromPageData(json)
}

// ─────────────────────────────────────────────────────────────────────────────
// 案例 A：图书馆管理（简单两表 + 主从关系）
// ─────────────────────────────────────────────────────────────────────────────

const CASE_A_JSON = {
  dataset: {
    dataSetName: 'LibraryDataSet',
    tables: {
      Readers: {
        columns: [
          { name: 'id',     type: 'number', isPrimaryKey: true, label: '读者ID'   },
          { name: 'name',   type: 'string',                     label: '姓名'     },
          { name: 'cardNo', type: 'string',                     label: '借阅卡号' },
          { name: 'phone',  type: 'string',                     label: '手机号'   },
          { name: 'status', type: 'string',                     label: '状态'     },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '张三', cardNo: 'LIB-001', phone: '13800001001', status: 'active'    },
              { id: 2, name: '李四', cardNo: 'LIB-002', phone: '13800001002', status: 'active'    },
              { id: 3, name: '王五', cardNo: 'LIB-003', phone: '13800001003', status: 'suspended' },
            ],
          },
        },
      },
      BorrowRecords: {
        columns: [
          { name: 'id',         type: 'number', isPrimaryKey: true, label: '记录ID'   },
          { name: 'readerId',   type: 'number',                     label: '读者ID'   },
          { name: 'bookTitle',  type: 'string',                     label: '书名'     },
          { name: 'borrowDate', type: 'date',                       label: '借阅日期' },
          { name: 'dueDate',    type: 'date',                       label: '应还日期' },
          { name: 'returnDate', type: 'date',   allowDBNull: true,  label: '实还日期' },
          { name: 'status',     type: 'string',                     label: '借阅状态' },
        ],
        views: {
          default: {
            rows: [
              { id: 1001, readerId: 1, bookTitle: 'JavaScript高级程序设计', borrowDate: '2024-03-01', dueDate: '2024-03-31', returnDate: '2024-03-20', status: 'returned' },
              { id: 1002, readerId: 1, bookTitle: 'Vue.js设计与实现',       borrowDate: '2024-04-01', dueDate: '2024-04-30', returnDate: null,         status: 'borrowed' },
              { id: 1003, readerId: 2, bookTitle: '算法导论',               borrowDate: '2024-04-05', dueDate: '2024-05-05', returnDate: '2024-04-28', status: 'returned' },
              { id: 1004, readerId: 3, bookTitle: '三体',                   borrowDate: '2024-02-10', dueDate: '2024-03-10', returnDate: null,         status: 'overdue'  },
            ],
          },
        },
      },
    },
    relations: [
      {
        relationName:   'ReaderBorrowRecords',
        parentTable:    'Readers',
        childTable:     'BorrowRecords',
        childField:     'readerId',
        dependencyType: 'currentRow',
        cascadeDelete:  true,
      },
    ],
  },
}

describe('PROMPT 验证 — 案例 A: 图书馆管理', () => {
  it('A-1: fromPageData 成功实例化 DataSet', () => {
    expect(() => fromPromptJson(CASE_A_JSON)).not.toThrow()
    const ds = fromPromptJson(CASE_A_JSON)
    expect(ds.dataSetName).toBe('LibraryDataSet')
  })

  it('A-2: 两张表都存在且视图行数正确', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!
    expect(readers).not.toBeNull()
    expect(borrows).not.toBeNull()
    expect(readers.rows).toHaveLength(3)
    expect(borrows.rows).toHaveLength(4)
  })

  it('A-3: 主键推导正确（isPrimaryKey: true）', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    expect(ds.getView('Readers')!.primaryKey).toBe('id')
    expect(ds.getView('BorrowRecords')!.primaryKey).toBe('id')
  })

  it('A-4: 内存级联 — 选中读者 1 → BorrowRecords 显示 2 条', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!

    readers.selection.setCurrentRow(readers.rows[0]!) // 张三 id=1
    expect(borrows.rows).toHaveLength(2)
    expect(borrows.rows.every(r => f(r, 'readerId') === 1)).toBe(true)
  })

  it('A-5: 内存级联 — 切换到读者 2 → BorrowRecords 显示 1 条', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!

    readers.selection.setCurrentRow(readers.rows[0]!)
    readers.selection.setCurrentRow(readers.rows[1]!) // 李四 id=2
    expect(borrows.rows).toHaveLength(1)
    expect(f(borrows.rows[0], 'readerId')).toBe(2)
  })

  it('A-6: 内存级联 — 切换到读者 3 → BorrowRecords 显示 1 条（overdue）', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!

    readers.selection.setCurrentRow(readers.rows[2]!) // 王五 id=3
    expect(borrows.rows).toHaveLength(1)
    expect(f(borrows.rows[0], 'status')).toBe('overdue')
  })

  it('A-7: 内存级联 — setCurrentRow(null) → BorrowRecords 清空', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!

    readers.selection.setCurrentRow(readers.rows[0]!)
    expect(borrows.rows).toHaveLength(2)
    readers.selection.setCurrentRow(null)
    expect(borrows.rows).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 案例 B：电商订单管理（计算列 + 聚合）
// ─────────────────────────────────────────────────────────────────────────────

const CASE_B_JSON = {
  dataset: {
    dataSetName: 'EcommerceOrderDataSet',
    tables: {
      Orders: {
        columns: [
          { name: 'id',           type: 'number', isPrimaryKey: true, label: '订单ID'   },
          { name: 'orderNo',      type: 'string',                     label: '订单号'   },
          { name: 'customerName', type: 'string',                     label: '客户姓名' },
          { name: 'orderDate',    type: 'date',                       label: '下单日期' },
          { name: 'status',       type: 'string',                     label: '订单状态' },
          { name: 'itemCount',    type: 'number', label: '商品件数',
            computeExpression: "$count('OrderItems')" },
          { name: 'totalAmount',  type: 'number', label: '订单总额',
            computeExpression: "$sum('OrderItems', 'subtotal')" },
        ],
        views: {
          default: {
            rows: [
              { id: 1, orderNo: 'ORD-2024001', customerName: '张三', orderDate: '2024-04-01', status: 'completed' },
              { id: 2, orderNo: 'ORD-2024002', customerName: '李四', orderDate: '2024-04-05', status: 'pending'   },
              { id: 3, orderNo: 'ORD-2024003', customerName: '王五', orderDate: '2024-04-10', status: 'shipped'   },
            ],
          },
        },
      },
      OrderItems: {
        columns: [
          { name: 'id',          type: 'number', isPrimaryKey: true, label: '明细ID'   },
          { name: 'orderId',     type: 'number',                     label: '订单ID'   },
          { name: 'productName', type: 'string',                     label: '商品名称' },
          { name: 'quantity',    type: 'number',                     label: '数量'     },
          { name: 'unitPrice',   type: 'number',                     label: '单价'     },
          { name: 'subtotal',    type: 'number', label: '小计',
            computeExpression: 'quantity * unitPrice' },
        ],
        views: {
          default: {
            rows: [
              { id: 1001, orderId: 1, productName: '无线鼠标',   quantity: 2, unitPrice: 99.99  },
              { id: 1002, orderId: 1, productName: '机械键盘',   quantity: 1, unitPrice: 299.00 },
              { id: 1003, orderId: 2, productName: 'USB集线器',  quantity: 3, unitPrice: 59.00  },
              { id: 1004, orderId: 3, productName: '显示器支架', quantity: 1, unitPrice: 189.00 },
              { id: 1005, orderId: 3, productName: '鼠标垫',     quantity: 2, unitPrice: 35.00  },
            ],
            aggregates: {
              quantity: { type: 'sum', label: '总数量'   },
              subtotal: { type: 'sum', label: '合计金额' },
            },
          },
        },
      },
    },
    relations: [
      {
        relationName:   'OrderItems',
        parentTable:    'Orders',
        childTable:     'OrderItems',
        childField:     'orderId',
        dependencyType: 'currentRow',
        cascadeDelete:  true,
      },
    ],
  },
}

describe('PROMPT 验证 — 案例 B: 电商订单管理', () => {
  it('B-1: fromPageData 成功实例化 DataSet', () => {
    expect(() => fromPromptJson(CASE_B_JSON)).not.toThrow()
  })

  it('B-2: 计算列 subtotal = quantity * unitPrice', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const items = ds.getView('OrderItems')!
    // items[0]: 2 * 99.99 = 199.98
    expect(f(items.rows[0], 'subtotal') as number).toBeCloseTo(199.98, 2)
    // items[1]: 1 * 299.00 = 299.00
    expect(f(items.rows[1], 'subtotal') as number).toBeCloseTo(299.00, 2)
    // items[2]: 3 * 59.00 = 177.00
    expect(f(items.rows[2], 'subtotal') as number).toBeCloseTo(177.00, 2)
    // items[3]: 1 * 189.00 = 189.00
    expect(f(items.rows[3], 'subtotal') as number).toBeCloseTo(189.00, 2)
    // items[4]: 2 * 35.00 = 70.00
    expect(f(items.rows[4], 'subtotal') as number).toBeCloseTo(70.00, 2)
  })

  it('B-3: 子表聚合 itemCount = $count(\'OrderItems\')', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    // 订单1: 2 件 (1001, 1002)
    expect(f(orders.rows[0], 'itemCount')).toBe(2)
    // 订单2: 1 件 (1003)
    expect(f(orders.rows[1], 'itemCount')).toBe(1)
    // 订单3: 2 件 (1004, 1005)
    expect(f(orders.rows[2], 'itemCount')).toBe(2)
  })

  it('B-4: 子表聚合 totalAmount = $sum(\'OrderItems\', \'subtotal\')', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    // 订单1: 199.98 + 299.00 = 498.98
    expect(f(orders.rows[0], 'totalAmount') as number).toBeCloseTo(498.98, 1)
    // 订单2: 177.00
    expect(f(orders.rows[1], 'totalAmount') as number).toBeCloseTo(177.00, 2)
    // 订单3: 189.00 + 70.00 = 259.00
    expect(f(orders.rows[2], 'totalAmount') as number).toBeCloseTo(259.00, 2)
  })

  it('B-5: 内存级联 — 选中订单 1 → OrderItems 显示 2 条', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    const items  = ds.getView('OrderItems')!

    orders.selection.setCurrentRow(orders.rows[0]!) // 订单 id=1
    expect(items.rows).toHaveLength(2)
    expect(items.rows.every(r => f(r, 'orderId') === 1)).toBe(true)
  })

  it('B-6: 内存级联后 summaryRow 聚合只计算过滤后的行', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    const items  = ds.getView('OrderItems')!

    orders.selection.setCurrentRow(orders.rows[0]!) // 订单1: 2 件
    // 级联后只有 2 行，summaryRow 仅汇总这 2 行
    expect(items.summaryRow).not.toBeNull()
    expect(f(items.summaryRow, 'quantity') as number).toBeCloseTo(3, 2)  // 2+1
    expect(f(items.summaryRow, 'subtotal') as number).toBeCloseTo(498.98, 1) // 199.98+299
  })

  it('B-7: 切换到订单 2 → OrderItems 级联 1 条，汇总更新', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    const items  = ds.getView('OrderItems')!

    orders.selection.setCurrentRow(orders.rows[0]!)
    orders.selection.setCurrentRow(orders.rows[1]!) // 订单 id=2
    expect(items.rows).toHaveLength(1)
    expect(f(items.rows[0], 'orderId')).toBe(2)
    expect(f(items.summaryRow, 'subtotal') as number).toBeCloseTo(177.00, 2) // 3*59
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 示例 9：学生成绩管理（$avg + 多语句 + aggregates）
// ─────────────────────────────────────────────────────────────────────────────

const EXAMPLE_9_JSON = {
  dataset: {
    dataSetName: 'StudentGradeDataSet',
    tables: {
      Students: {
        columns: [
          { name: 'id',        type: 'number', isPrimaryKey: true, label: '学号' },
          { name: 'name',      type: 'string',                     label: '姓名' },
          { name: 'className', type: 'string',                     label: '班级' },
          { name: 'gradeAvg',  type: 'number',                     label: '平均分',
            computeExpression: "$avg('Grades', 'score')" },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '张三', className: '高一(1)班' },
              { id: 2, name: '李四', className: '高一(1)班' },
              { id: 3, name: '王五', className: '高一(2)班' },
            ],
          },
        },
      },
      Grades: {
        columns: [
          { name: 'id',        type: 'number', isPrimaryKey: true, label: '成绩ID' },
          { name: 'studentId', type: 'number',                     label: '学号'   },
          { name: 'subject',   type: 'string',                     label: '科目'   },
          { name: 'score',     type: 'number',                     label: '分数'   },
          { name: 'grade',     type: 'string',                     label: '等级',
            computeExpression: "if (score >= 90) return 'A'; if (score >= 75) return 'B'; if (score >= 60) return 'C'; return 'D';" },
        ],
        views: {
          default: {
            rows: [
              { id: 1001, studentId: 1, subject: '数学', score: 95 },
              { id: 1002, studentId: 1, subject: '语文', score: 82 },
              { id: 1003, studentId: 2, subject: '数学', score: 76 },
              { id: 1004, studentId: 2, subject: '语文', score: 68 },
              { id: 1005, studentId: 3, subject: '数学', score: 55 },
              { id: 1006, studentId: 3, subject: '语文', score: 70 },
            ],
            aggregates: {
              score: { type: 'avg',   label: '平均分' },
              id:    { type: 'count', label: '科目数' },
            },
          },
        },
      },
    },
    relations: [
      {
        relationName:   'StudentGrades',
        parentTable:    'Students',
        childTable:     'Grades',
        childField:     'studentId',
        dependencyType: 'currentRow',
      },
    ],
  },
}

describe('PROMPT 验证 — 示例 9: 学生成绩管理', () => {
  it('E9-1: fromPageData 成功实例化 DataSet', () => {
    expect(() => fromPromptJson(EXAMPLE_9_JSON)).not.toThrow()
  })

  it('E9-2: 子表聚合 gradeAvg = $avg(\'Grades\', \'score\')', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const students = ds.getView('Students')!
    // 张三: (95+82)/2 = 88.5
    expect(f(students.rows[0], 'gradeAvg') as number).toBeCloseTo(88.5, 1)
    // 李四: (76+68)/2 = 72.0
    expect(f(students.rows[1], 'gradeAvg') as number).toBeCloseTo(72.0, 1)
    // 王五: (55+70)/2 = 62.5
    expect(f(students.rows[2], 'gradeAvg') as number).toBeCloseTo(62.5, 1)
  })

  it('E9-3: 多语句计算列 grade — 各分支正确', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const grades = ds.getView('Grades')!
    // score=95 → A
    expect(f(grades.rows[0], 'grade')).toBe('A')
    // score=82 → B
    expect(f(grades.rows[1], 'grade')).toBe('B')
    // score=76 → B
    expect(f(grades.rows[2], 'grade')).toBe('B')
    // score=68 → C
    expect(f(grades.rows[3], 'grade')).toBe('C')
    // score=55 → D
    expect(f(grades.rows[4], 'grade')).toBe('D')
    // score=70 → C
    expect(f(grades.rows[5], 'grade')).toBe('C')
  })

  it('E9-4: 视图聚合 summaryRow（全部 6 行）', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const grades = ds.getView('Grades')!
    expect(grades.summaryRow).not.toBeNull()
    // avg(95,82,76,68,55,70) = 446/6 ≈ 74.33
    expect(f(grades.summaryRow, 'score') as number).toBeCloseTo(74.33, 1)
    // count = 6
    expect(f(grades.summaryRow, 'id')).toBe(6)
  })

  it('E9-5: 内存级联 — 选中张三 → Grades 显示 2 条（数学+语文）', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const students = ds.getView('Students')!
    const grades   = ds.getView('Grades')!

    students.selection.setCurrentRow(students.rows[0]!) // 张三 id=1
    expect(grades.rows).toHaveLength(2)
    expect(grades.rows.every(r => f(r, 'studentId') === 1)).toBe(true)
  })

  it('E9-6: 级联后 summaryRow 只汇总过滤行', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const students = ds.getView('Students')!
    const grades   = ds.getView('Grades')!

    students.selection.setCurrentRow(students.rows[0]!) // 张三：95, 82
    expect(f(grades.summaryRow, 'id')).toBe(2)           // count=2
    expect(f(grades.summaryRow, 'score') as number).toBeCloseTo(88.5, 1) // avg(95,82)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 案例 C：HR 部门管理（API + 多语句 + $count + 视图聚合）
// ─────────────────────────────────────────────────────────────────────────────

const CASE_C_JSON = {
  dataset: {
    dataSetName: 'HRDataSet',
    tables: {
      Departments: {
        columns: [
          { name: 'id',        type: 'number', isPrimaryKey: true, label: '部门ID'   },
          { name: 'name',      type: 'string',                     label: '部门名称' },
          { name: 'managerId', type: 'number', allowDBNull: true,  label: '主管ID'   },
          { name: 'headcount', type: 'number',                     label: '人数',
            computeExpression: "$count('Employees')" },
        ],
        api: '/api/departments',
        views: {
          default: {
            rows: [
              { id: 1, name: '技术部', managerId: 101  },
              { id: 2, name: '产品部', managerId: 201  },
              { id: 3, name: '市场部', managerId: null  },
            ],
            autoLoad: true,
          },
        },
      },
      Employees: {
        columns: [
          { name: 'id',       type: 'number', isPrimaryKey: true, label: '员工ID'   },
          { name: 'deptId',   type: 'number',                     label: '部门ID'   },
          { name: 'name',     type: 'string',                     label: '姓名'     },
          { name: 'gender',   type: 'string',                     label: '性别'     },
          { name: 'position', type: 'string',                     label: '职位'     },
          { name: 'salary',   type: 'number',                     label: '薪资'     },
          { name: 'hireDate', type: 'date',                       label: '入职日期' },
          { name: 'level',    type: 'string',                     label: '薪资等级',
            computeExpression: "if (salary >= 30000) return 'S'; if (salary >= 20000) return 'A'; if (salary >= 10000) return 'B'; return 'C';" },
        ],
        api: '/api/employees',
        views: {
          default: {
            rows: [
              { id: 101, deptId: 1, name: '张工', gender: '男', position: '高级工程师', salary: 28000, hireDate: '2020-03-15' },
              { id: 102, deptId: 1, name: '李工', gender: '女', position: '工程师',     salary: 18000, hireDate: '2021-07-01' },
              { id: 201, deptId: 2, name: '王总', gender: '男', position: '产品总监',   salary: 35000, hireDate: '2019-05-20' },
              { id: 202, deptId: 2, name: '赵妹', gender: '女', position: '产品经理',   salary: 22000, hireDate: '2022-01-10' },
              { id: 301, deptId: 3, name: '孙明', gender: '男', position: '市场专员',   salary: 9500,  hireDate: '2023-06-01' },
            ],
            autoLoad: false,
            aggregates: {
              salary: { type: 'avg',   label: '平均薪资' },
              id:     { type: 'count', label: '人数'     },
            },
          },
        },
      },
    },
    relations: [
      {
        relationName:   'DeptEmployees',
        parentTable:    'Departments',
        childTable:     'Employees',
        childField:     'deptId',
        dependencyType: 'currentRow',
        cascadeDelete:  false,
      },
    ],
  },
}

describe('PROMPT 验证 — 案例 C: HR 部门管理', () => {
  it('C-1: fromPageData 成功实例化（含 api + autoLoad 配置）', () => {
    expect(() => fromPromptJson(CASE_C_JSON)).not.toThrow()
  })

  it('C-2: 多语句计算列 level — 薪资等级', () => {
    const ds = fromPromptJson(CASE_C_JSON)
    const employees = ds.getView('Employees')!
    // salary=28000: ≥20000 but <30000 → A
    expect(f(employees.rows[0], 'level')).toBe('A')
    // salary=18000: ≥10000 but <20000 → B
    expect(f(employees.rows[1], 'level')).toBe('B')
    // salary=35000: ≥30000 → S
    expect(f(employees.rows[2], 'level')).toBe('S')
    // salary=22000: ≥20000 but <30000 → A
    expect(f(employees.rows[3], 'level')).toBe('A')
    // salary=9500: <10000 → C
    expect(f(employees.rows[4], 'level')).toBe('C')
  })

  it('C-3: 子表聚合 headcount = $count(\'Employees\')', () => {
    const ds = fromPromptJson(CASE_C_JSON)
    const depts = ds.getView('Departments')!
    // 技术部: 101, 102 → 2
    expect(f(depts.rows[0], 'headcount')).toBe(2)
    // 产品部: 201, 202 → 2
    expect(f(depts.rows[1], 'headcount')).toBe(2)
    // 市场部: 301 → 1
    expect(f(depts.rows[2], 'headcount')).toBe(1)
  })

  it('C-4: 初始 summaryRow（全 5 名员工）', () => {
    const ds = fromPromptJson(CASE_C_JSON)
    const employees = ds.getView('Employees')!
    // avg salary: (28000+18000+35000+22000+9500)/5 = 112500/5 = 22500
    expect(f(employees.summaryRow, 'salary') as number).toBeCloseTo(22500, 0)
    // count = 5
    expect(f(employees.summaryRow, 'id')).toBe(5)
  })

  // 注：Employees 配置了 api: '/api/employees'，级联触发的是 HTTP 请求而非内存过滤。
  // 需要 mock loadFromServer 才能验证级联行为，此处仅验证结构正确性。
  // API 级联行为的测试见 dataset-request-orchestration.test.ts。
  it('C-5: DataSet 含 api 配置时 relations 仍能正常注册', () => {
    const ds = fromPromptJson(CASE_C_JSON)
    // relations 规范化后 parentViewId/childViewId 均默认 'default'
    const rel = ds.relations?.[0]
    expect(rel?.parentTable).toBe('Departments')
    expect(rel?.childTable).toBe('Employees')
    expect(rel?.parentViewId).toBe('default')
    expect(rel?.childViewId).toBe('default')
    // 有 API 的子表 crudService 存在（cascade 走网络路径）
    const employees = ds.getView('Employees')!
    expect(employees.crudService).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 案例 G：仓库库存管理
// 验证 v1.9 提示词修正的所有新特性：
//   - integer / decimal 类型
//   - 复合主键（多列 isPrimaryKey: true → 自动合成 _pk）
//   - $list 聚合函数
//   - aggregates field 覆盖（输出名 ≠ 源字段名）
//   - aggregates separator（join 分隔符）
//   - parentField（父视图匹配字段）
// ─────────────────────────────────────────────────────────────────────────────

const CASE_G_JSON = {
  dataset: {
    dataSetName: 'WarehouseInventoryDataSet',
    tables: {
      Warehouses: {
        columns: [
          { name: 'id',            type: 'integer', isPrimaryKey: true, label: '仓库ID'   },
          { name: 'name',          type: 'varchar',                     label: '仓库名称' },
          { name: 'city',          type: 'varchar',                     label: '所在城市' },
          // $sum 子表聚合：聚合 StockItems.totalValue
          { name: 'totalStockValue', type: 'decimal', label: '库存总值',
            computeExpression: "$sum('StockItems', 'totalValue')" },
          // $list → 返回产品编码数组（unknown[]）
          { name: 'productCodes',  type: 'array',                       label: '产品编码列表',
            computeExpression: "$list('StockItems', 'productCode')" },
          // $join → 返回产品名称拼接字符串
          { name: 'productNames',  type: 'string',                      label: '产品名称拼接',
            computeExpression: "$join('StockItems', 'productName', ' / ')" },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '北京仓', city: '北京' },
              { id: 2, name: '上海仓', city: '上海' },
            ],
          },
        },
      },
      StockItems: {
        columns: [
          // 复合主键：两列同时标记 isPrimaryKey → 框架自动合成 _pk 计算列
          { name: 'warehouseId',  type: 'integer', isPrimaryKey: true, label: '仓库ID'   },
          { name: 'productCode',  type: 'varchar', isPrimaryKey: true, label: '产品编码' },
          { name: 'productName',  type: 'varchar',                     label: '产品名称' },
          { name: 'quantity',     type: 'integer',                     label: '库存数量' },
          { name: 'unitPrice',    type: 'decimal',                     label: '单价'     },
          // 计算列：数量 * 单价
          { name: 'totalValue',   type: 'decimal',                     label: '库存价值',
            computeExpression: 'quantity * unitPrice' },
        ],
        views: {
          default: {
            rows: [
              { warehouseId: 1, productCode: 'P001', productName: '笔记本电脑', quantity: 10,  unitPrice: 5999.99 },
              { warehouseId: 1, productCode: 'P002', productName: '无线鼠标',   quantity: 50,  unitPrice: 99.50   },
              { warehouseId: 2, productCode: 'P001', productName: '笔记本电脑', quantity: 5,   unitPrice: 5999.99 },
              { warehouseId: 2, productCode: 'P003', productName: '机械键盘',   quantity: 20,  unitPrice: 299.00  },
            ],
            aggregates: {
              // field 覆盖：输出键 totalVal，源字段 totalValue
              totalVal:    { type: 'sum',  field: 'totalValue', label: '库存总值'  },
              // separator：join 类型使用自定义分隔符
              productList: { type: 'join', field: 'productName', separator: ' | ', label: '产品列表' },
            },
          },
        },
      },
    },
    relations: [
      {
        relationName:   'WarehouseStock',
        parentTable:    'Warehouses',
        parentField:    'id',            // 显式声明 parentField（默认取主键，此处等价）
        childTable:     'StockItems',
        childField:     'warehouseId',
        dependencyType: 'currentRow',
      },
    ],
  },
}

describe('PROMPT 验证 — 案例 G: 仓库库存管理（v1.9 新特性）', () => {
  it('G-1: fromPageData 成功实例化', () => {
    expect(() => fromPromptJson(CASE_G_JSON)).not.toThrow()
  })

  it('G-2: integer / decimal / varchar 类型被框架接受，rows 加载正确', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    expect(ds.getView('Warehouses')!.rows).toHaveLength(2)
    expect(ds.getView('StockItems')!.rows).toHaveLength(4)
  })

  it('G-3: 复合主键 → primaryKey 变为 _pk，_pk 值已自动填充', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const items = ds.getView('StockItems')!
    // 多列 isPrimaryKey 时框架注入 _pk 计算列（字段名合并）
    expect(items.primaryKey).toBe('_pk')
    // 每行都有 _pk 值
    expect(items.rows.every(r => r['_pk'] !== undefined)).toBe(true)
    // 前两行 warehouseId=1 但 productCode 不同，_pk 应不同
    expect(items.rows[0]!['_pk']).not.toBe(items.rows[1]!['_pk'])
  })

  it('G-4: 计算列 totalValue = quantity * unitPrice（decimal 精度）', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const items = ds.getView('StockItems')!
    // P001@仓库1: 10 * 5999.99 = 59999.9
    expect(f(items.rows[0], 'totalValue') as number).toBeCloseTo(59999.9, 1)
    // P002@仓库1: 50 * 99.50 = 4975
    expect(f(items.rows[1], 'totalValue') as number).toBeCloseTo(4975, 1)
    // P001@仓库2: 5 * 5999.99 = 29999.95
    expect(f(items.rows[2], 'totalValue') as number).toBeCloseTo(29999.95, 1)
    // P003@仓库2: 20 * 299.00 = 5980
    expect(f(items.rows[3], 'totalValue') as number).toBeCloseTo(5980, 1)
  })

  it('G-5: $join 计算列 productNames 在 Warehouses 上正确聚合（级联前基于全量行）', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    // 仓库1的 productNames: 笔记本电脑 / 无线鼠标（按 rows 顺序）
    expect(f(warehouses.rows[0], 'productNames')).toBe('笔记本电脑 / 无线鼠标')
    // 仓库2的 productNames: 笔记本电脑 / 机械键盘
    expect(f(warehouses.rows[1], 'productNames')).toBe('笔记本电脑 / 机械键盘')
  })

  it('G-6: $sum 计算列 totalStockValue 在 Warehouses 上正确', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    // 仓库1: 59999.9 + 4975 = 64974.9
    expect(f(warehouses.rows[0], 'totalStockValue') as number).toBeCloseTo(64974.9, 0)
    // 仓库2: 29999.95 + 5980 = 35979.95
    expect(f(warehouses.rows[1], 'totalStockValue') as number).toBeCloseTo(35979.95, 0)
  })

  it('G-7: aggregates field 覆盖 — totalVal.field = totalValue', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const items = ds.getView('StockItems')!
    // summaryRow 输出键是 totalVal（不是 totalValue）
    // 全部 4 行: 59999.9 + 4975 + 29999.95 + 5980 = 100954.85
    expect(f(items.summaryRow, 'totalVal') as number).toBeCloseTo(100954.85, 0)
    // 原字段名 totalValue 不应出现在 summaryRow 中（键名覆盖）
    expect(f(items.summaryRow, 'totalValue')).toBeUndefined()
  })

  it('G-8: aggregates separator — productList 使用 " | " 分隔', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const items = ds.getView('StockItems')!
    // 全部 4 行产品名用 " | " 拼接
    expect(f(items.summaryRow, 'productList')).toBe('笔记本电脑 | 无线鼠标 | 笔记本电脑 | 机械键盘')
  })

  it('G-9: 内存级联（parentField 显式声明）— 选中仓库 1 → StockItems 显示 2 条', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    const items      = ds.getView('StockItems')!

    warehouses.selection.setCurrentRow(warehouses.rows[0]!) // 北京仓 id=1
    expect(items.rows).toHaveLength(2)
    expect(items.rows.every(r => f(r, 'warehouseId') === 1)).toBe(true)
  })

  it('G-10: 级联后 aggregates 只汇总过滤行（field 覆盖 + separator 均有效）', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    const items      = ds.getView('StockItems')!

    warehouses.selection.setCurrentRow(warehouses.rows[0]!) // 北京仓：2 条
    // totalVal = 59999.9 + 4975 = 64974.9
    expect(f(items.summaryRow, 'totalVal') as number).toBeCloseTo(64974.9, 0)
    // productList separator
    expect(f(items.summaryRow, 'productList')).toBe('笔记本电脑 | 无线鼠标')
  })

  it('G-11: $list 计算列 productCodes 返回产品编码数组', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    // 仓库1（北京仓）: P001, P002
    const codes1 = f(warehouses.rows[0], 'productCodes') as unknown[]
    expect(Array.isArray(codes1)).toBe(true)
    expect(codes1).toHaveLength(2)
    expect(codes1).toContain('P001')
    expect(codes1).toContain('P002')
    // 仓库2（上海仓）: P001, P003
    const codes2 = f(warehouses.rows[1], 'productCodes') as unknown[]
    expect(Array.isArray(codes2)).toBe(true)
    expect(codes2).toHaveLength(2)
    expect(codes2).toContain('P001')
    expect(codes2).toContain('P003')
  })
})
