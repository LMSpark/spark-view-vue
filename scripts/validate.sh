#!/usr/bin/env bash

# SPARK.View 完整验证脚本
# 执行：安装 → 构建 → 测试 → 启动 SSR → 性能验证

set -e

echo "========================================="
echo "SPARK.View Validation Script"
echo "========================================="

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

function log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

function log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# 步骤 1: 安装依赖
log_info "Step 1: Installing dependencies..."
if ! pnpm install --frozen-lockfile; then
  log_error "Failed to install dependencies"
  exit 1
fi

# 步骤 2: 构建所有 packages
log_info "Step 2: Building all packages..."
if ! pnpm -w build; then
  log_error "Failed to build packages"
  exit 1
fi

# 步骤 3: 运行测试
log_info "Step 3: Running tests..."
if ! pnpm -w test; then
  log_error "Tests failed"
  exit 1
fi

# 步骤 4: 启动 SSR 服务器（后台）
log_info "Step 4: Starting SSR server..."
pnpm --filter @spark-view/ssr-server dev &
SSR_PID=$!
log_info "SSR server started (PID: $SSR_PID)"

# 等待服务器启动
sleep 5

# 步骤 5: 验证 SSR 端点
log_info "Step 5: Validating SSR endpoints..."
if ! curl -f http://localhost:3000/health > /dev/null 2>&1; then
  log_error "SSR server health check failed"
  kill $SSR_PID 2>/dev/null || true
  exit 1
fi

log_info "Health check passed ✓"

# 步骤 6: 运行性能验证（如果存在）
if [ -f "scripts/performance-test.js" ]; then
  log_info "Step 6: Running performance tests..."
  if ! node scripts/performance-test.js; then
    log_warn "Performance tests failed (non-blocking)"
  fi
else
  log_warn "Performance test script not found, skipping..."
fi

# 清理
log_info "Cleaning up..."
kill $SSR_PID 2>/dev/null || true

# 生成验证报告
cat > validation-report.json <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "success",
  "steps": {
    "install": "passed",
    "build": "passed",
    "test": "passed",
    "ssr": "passed"
  }
}
EOF

echo "========================================="
log_info "Validation completed successfully! ✓"
echo "========================================="

exit 0
