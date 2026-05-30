export default {
  methods: {
    // ===== 员工状态服务 =====
    statusLabel(row) {
      const value = row?.["status"];
      if (value == null || value === "") return "未设置";
      const map = { "在职": "在职", "离职": "离职", "试用": "试用期", "休假": "休假中" };
      return map[value] || String(value);
    },

    statusClass(row) {
      const value = row?.["status"];
      const map = {
        "在职": "status-active",
        "离职": "status-inactive",
        "试用": "status-probation",
        "休假": "status-leave"
      };
      return map[value] || "status-unknown";
    },

    getStatusCounts(rows) {
      const counts = { total: (rows || []).length, active: 0, inactive: 0, probation: 0, leave: 0 };
      (rows || []).forEach(row => {
        const s = row?.status;
        if (s === "在职") counts.active++;
        else if (s === "离职") counts.inactive++;
        else if (s === "试用") counts.probation++;
        else if (s === "休假") counts.leave++;
      });
      return counts;
    },

    isActive(row) {
      return row?.["status"] === "在职";
    },

    isInactive(row) {
      return row?.["status"] === "离职";
    },

    // ===== 联系方式校验 =====
    validatePhone(phone) {
      if (!phone || String(phone).trim() === "") return { valid: false, message: "联系电话不能为空" };
      const cleaned = String(phone).replace(/\s|-/g, "");
      const mobileRegex = /^1[3-9]\d{9}$/;
      const landlineRegex = /^0\d{2,3}-?\d{7,8}$/;
      if (mobileRegex.test(cleaned) || landlineRegex.test(cleaned)) {
        return { valid: true, message: "" };
      }
      return { valid: false, message: "联系电话格式不正确，请输入有效手机号或座机号" };
    },

    validateEmail(email) {
      if (!email || String(email).trim() === "") return { valid: false, message: "邮箱不能为空" };
      const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (regex.test(String(email).trim())) {
        return { valid: true, message: "" };
      }
      return { valid: false, message: "邮箱格式不正确" };
    },

    validateEmployee(row) {
      const errors = [];
      if (!row?.name || String(row.name).trim() === "") {
        errors.push("姓名不能为空");
      }
      if (!row?.department || String(row.department).trim() === "") {
        errors.push("请选择部门");
      }
      if (!row?.position || String(row.position).trim() === "") {
        errors.push("请选择岗位");
      }
      const phoneResult = this.validatePhone(row?.phone);
      if (!phoneResult.valid) {
        errors.push(phoneResult.message);
      }
      const emailResult = this.validateEmail(row?.email);
      if (!emailResult.valid) {
        errors.push(emailResult.message);
      }
      if (row?.idNumber && !/^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(String(row.idNumber))) {
        errors.push("身份证号格式不正确");
      }
      return { valid: errors.length === 0, errors };
    },

    // ===== 部门岗位筛选 =====
    filterByDepartment(rows, department) {
      if (!department || String(department).trim() === "") return rows;
      const val = String(department).trim();
      return (rows || []).filter(row => String(row?.department ?? "") === val);
    },

    filterByPosition(rows, position) {
      if (!position || String(position).trim() === "") return rows;
      const val = String(position).trim();
      return (rows || []).filter(row => String(row?.position ?? "") === val);
    },

    filterByStatus(rows, status) {
      if (!status || String(status).trim() === "") return rows;
      const val = String(status).trim();
      return (rows || []).filter(row => String(row?.status ?? "") === val);
    },

    searchEmployee(rows, keyword) {
      const value = String(keyword ?? "").trim().toLowerCase();
      if (value.length === 0) return rows;
      return (rows || []).filter(row =>
        Object.values(row ?? {}).some(item => String(item ?? "").toLowerCase().includes(value))
      );
    },

    // ===== 工具函数 =====
    formatJoinDate(row) {
      const val = row?.["joinDate"];
      if (!val) return "--";
      return String(val).slice(0, 10);
    },

    getDepartmentOptions() {
      return ["技术部", "产品部", "市场部", "人事部", "财务部"];
    },

    getPositionOptions() {
      return ["经理", "主管", "工程师", "专员", "助理"];
    },

    getStatusOptions() {
      return ["在职", "离职", "试用", "休假"];
    }
  }
}