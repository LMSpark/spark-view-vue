/**
 * 性能验证脚本
 * 使用 Playwright 测量 TTFB、First Paint、LCP、Hydration Cost
 */

import { chromium } from 'playwright';
import fs from 'fs';

async function runPerformanceTest() {
  console.log('Starting performance tests...\n');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const metrics = {
    timestamp: new Date().toISOString(),
    tests: [],
  };

  // 测试 1: SSR 首页
  console.log('Test 1: SSR Homepage');
  await page.goto('http://localhost:3000/render/home');

  const perfData = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');

    return {
      ttfb: navigation.responseStart - navigation.requestStart,
      firstPaint: paint.find((p) => p.name === 'first-paint')?.startTime || 0,
      fcp: paint.find((p) => p.name === 'first-contentful-paint')?.startTime || 0,
      domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
      loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
    };
  });

  console.log(`  TTFB: ${perfData.ttfb.toFixed(2)}ms`);
  console.log(`  First Paint: ${perfData.firstPaint.toFixed(2)}ms`);
  console.log(`  FCP: ${perfData.fcp.toFixed(2)}ms`);
  console.log(`  DOM Content Loaded: ${perfData.domContentLoaded.toFixed(2)}ms`);
  console.log(`  Load Complete: ${perfData.loadComplete.toFixed(2)}ms\n`);

  metrics.tests.push({
    name: 'SSR Homepage',
    ...perfData,
  });

  // 测试 2: 水合性能
  console.log('Test 2: Hydration Performance');

  const hydrationStart = Date.now();

  await page.evaluate(() => {
    return new Promise((resolve) => {
      const checkHydration = setInterval(() => {
        const hydratedCount = document.querySelectorAll('.hydrated').length;
        const totalHints = window.__HYDRATION_HINTS__?.length || 0;

        if (hydratedCount >= totalHints || Date.now() - window.__HYDRATION_START__ > 5000) {
          clearInterval(checkHydration);
          resolve(true);
        }
      }, 100);

      window.__HYDRATION_START__ = Date.now();
    });
  });

  const hydrationTime = Date.now() - hydrationStart;
  console.log(`  Hydration Time: ${hydrationTime}ms\n`);

  metrics.tests.push({
    name: 'Hydration Performance',
    hydrationTime,
  });

  // 关闭浏览器
  await browser.close();

  // 输出报告
  const reportPath = 'performance-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));

  console.log(`Performance report saved to ${reportPath}`);

  // 检查阈值
  const passed = perfData.ttfb < 200 && perfData.fcp < 1000 && hydrationTime < 3000;

  if (passed) {
    console.log('\n✓ Performance tests PASSED');
    process.exit(0);
  } else {
    console.log('\n✗ Performance tests FAILED (thresholds exceeded)');
    process.exit(1);
  }
}

// 检查 SSR 服务器是否运行
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/health');
    return response.ok;
  } catch {
    return false;
  }
}

// 主函数
(async () => {
  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.error('SSR server is not running on http://localhost:3000');
    console.error('Please start the server first: pnpm --filter @spark-view/ssr-server dev');
    process.exit(1);
  }

  await runPerformanceTest();
})();
