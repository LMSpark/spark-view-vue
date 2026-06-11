<!--
@module app:views/platform/HomePage
app 的 views/platform/HomePage 模块。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <div class="home-page">
    <!-- ── Hero 区域 ── -->
    <header class="hero">
      <nav class="hero-nav">
        <span class="hero-logo"><NavIcon name="Lightning" :size="20" /> SPARK AppWorks</span>
        <div class="hero-nav-right">
          <router-link to="/login" class="nav-link">登录</router-link>
          <router-link to="/login" class="nav-link nav-link--primary" @click="setRegisterTab">
            免费注册
          </router-link>
        </div>
      </nav>

      <div class="hero-body">
        <p class="hero-eyebrow">SPARK 融合平台 · 应用工场</p>
        <h1 class="hero-title">
          企业应用系统<br>是 <span class="hero-highlight">配置驱动</span>构建出来的
        </h1>
        <p class="hero-desc">
          不是让需求无边界扩散成代码，而是把页面结构、数据模型、权限策略和最小化脚本收敛到受约束的配置空间。<br>
          SPARK AppWorks 用稳定运行时承接多租户、多系统 SaaS 场景，把交付效率和维护升级成本控制放在同一条链路里。
        </p>
        <div class="hero-metrics">
          <div class="metric">
            <span class="metric-value">多租户</span>
            <span class="metric-label">租户隔离与配置分层</span>
          </div>
          <div class="metric-divider"></div>
          <div class="metric">
            <span class="metric-value">多系统</span>
            <span class="metric-label">项目与业务域统一承载</span>
          </div>
          <div class="metric-divider"></div>
          <div class="metric">
            <span class="metric-value">低成本</span>
            <span class="metric-label">维护升级更可控</span>
          </div>
        </div>
        <div class="hero-actions">
          <router-link to="/demo/custom-r-table" class="btn btn--primary btn--lg">
            查看三大 Demo
          </router-link>
          <router-link to="/login" class="btn btn--outline btn--lg" @click="setRegisterTab">
            免费注册
          </router-link>
        </div>
        <div class="hero-proof">
          <span class="hero-proof-item">受约束配置生成</span>
          <span class="hero-proof-item">稳定运行时解释执行</span>
          <span class="hero-proof-item">多租户 + 多系统统一承载</span>
        </div>
      </div>
    </header>

    <section class="demo-showcase">
      <p class="demo-showcase__eyebrow">Business Demo</p>
      <h2 class="section-title">直接看出平台价值的三大 Demo</h2>
      <p class="section-desc demo-showcase__desc">
        不是原始渲染器验证页，而是更接近企业系统交付的三类典型场景：树形配置、主从联动、权限驱动。
      </p>
      <div class="demo-showcase__grid">
        <article
          v-for="demo in platformDemos"
          :key="demo.path"
          class="demo-showcase__card"
        >
          <div class="demo-showcase__card-head">
            <span class="demo-showcase__badge">{{ demo.badge }}</span>
            <span class="demo-showcase__path">{{ demo.path }}</span>
          </div>
          <h3>{{ demo.title }}</h3>
          <p>{{ demo.description }}</p>
          <ul class="demo-showcase__points">
            <li v-for="point in demo.points" :key="point">{{ point }}</li>
          </ul>
          <router-link :to="demo.path" class="demo-showcase__link">打开 Demo</router-link>
        </article>
      </div>
    </section>

    <!-- ── 范式对比 ── -->
    <section class="paradigm">
      <h2 class="section-title">从代码堆叠，到配置驱动系统</h2>
      <p class="section-desc">在企业场景里，关键不是第一次生成得多快，而是后续能否稳定维护和升级</p>
      <div class="paradigm-compare">
        <div class="paradigm-card paradigm-card--old">
          <div class="paradigm-badge">传统生成平台</div>
          <div class="paradigm-flow">
            <div class="flow-step">用户需求 → LLM</div>
            <div class="flow-step">自由格式代码 / 页面拼接</div>
            <div class="flow-step warn">编译 + 运行 + 人工排错</div>
            <div class="flow-step warn">租户/系统差异落到分叉代码</div>
            <div class="flow-step warn">升级时逐系统回归验证</div>
            <div class="flow-step">长期维护成本持续上升</div>
          </div>
        </div>
        <div class="paradigm-vs">VS</div>
        <div class="paradigm-card paradigm-card--new">
          <div class="paradigm-badge">SPARK AppWorks</div>
          <div class="paradigm-flow">
            <div class="flow-step">用户需求 → LLM</div>
            <div class="flow-step ok">页面结构 + 数据模型 + 权限配置</div>
            <div class="flow-step ok">结构校验 + 运行时解释执行</div>
            <div class="flow-step ok">租户/系统差异收敛到配置层</div>
            <div class="flow-step ok">日志自动回传并驱动精准修复</div>
            <div class="flow-step ok">平台升级优先收敛在运行时</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 四文件体系 ── -->
    <section class="four-files">
      <h2 class="section-title">企业系统由 4 类资产配置出来</h2>
      <p class="section-desc">受约束配置生成，运行时解释执行，长期维护和升级成本更低</p>
      <div class="files-grid">
        <div class="file-card">
          <div class="file-header">
            <span class="file-ext">.json</span>
            <span class="file-name">rule.json</span>
          </div>
          <p class="file-role">UI 组件树</p>
          <p class="file-desc">声明页面结构、组件嵌套、属性绑定。组件类型可查注册表自动校验。</p>
        </div>
        <div class="file-card">
          <div class="file-header">
            <span class="file-ext">.json</span>
            <span class="file-name">pagedata.json</span>
          </div>
          <p class="file-role">数据模型</p>
          <p class="file-desc">DataSet 定义：表结构、列类型、关系、聚合、API 端点，一切尽在其中。</p>
        </div>
        <div class="file-card">
          <div class="file-header">
            <span class="file-ext">.js</span>
            <span class="file-name">script.js</span>
          </div>
          <p class="file-role">业务逻辑</p>
          <p class="file-desc">沙箱执行的受限脚本，仅处理事件响应与业务分支——不写框架样板代码。</p>
        </div>
        <div class="file-card">
          <div class="file-header">
            <span class="file-ext">.css</span>
            <span class="file-name">style.css</span>
          </div>
          <p class="file-role">页面样式</p>
          <p class="file-desc">自动 scope 隔离的 CSS，选择器可正则校验，不污染全局。</p>
        </div>
      </div>
    </section>

    <!-- ── 配置闭环迭代 ── -->
    <section class="config-loop">
      <h2 class="section-title">受约束配置闭环</h2>
      <p class="section-desc">不是让系统猜页面怎么修，而是把结构化日志、配置边界和运行时约束纳入同一条修复链路</p>
      <div class="loop-container">
        <div class="loop-track">
          <div class="loop-node">
            <div class="loop-icon"><NavIcon name="MagicStick" :size="28" /></div>
            <div class="loop-label">生成 4 文件</div>
          </div>
          <div class="loop-arrow">→</div>
          <div class="loop-node">
            <div class="loop-icon"><NavIcon name="Promotion" :size="28" /></div>
            <div class="loop-label">SSE 热更新渲染</div>
          </div>
          <div class="loop-arrow">→</div>
          <div class="loop-node">
            <div class="loop-icon"><NavIcon name="Document" :size="28" /></div>
            <div class="loop-label">Logger 自动收集日志</div>
          </div>
          <div class="loop-arrow">→</div>
          <div class="loop-node">
            <div class="loop-icon"><NavIcon name="Refresh" :size="28" /></div>
            <div class="loop-label">日志回传并精准修复</div>
          </div>
        </div>
        <div class="loop-caption">配置生成、热更新、日志回传和自动修复走在同一条闭环里</div>
        <div class="loop-compare">
          <div class="compare-item compare-item--old">
            <span class="compare-tag">传统</span>
            人 ↔ 系统，人工传递错误信息，页面差异和系统差异都落到代码层
          </div>
          <div class="compare-item compare-item--new">
            <span class="compare-tag">SPARK</span>
            运行时 ↔ 配置链路，自动传递结构化日志，优先修配置而不是扩散代码
          </div>
        </div>
      </div>
    </section>

    <!-- ── 核心能力 ── -->
    <section class="features">
      <h2 class="section-title">平台直接落地的六个理由</h2>
      <p class="section-desc">从多租户 SaaS 到企业后台交付，核心不是能不能生成，而是能不能长期演进</p>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon"><NavIcon name="Document" :size="32" /></div>
          <h3>配置驱动系统</h3>
          <p>生成页面结构配置、数据模型配置、样式配置和最小化脚本，不让复杂度无边界扩散到业务代码。</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon"><NavIcon name="Share" :size="32" /></div>
          <h3>稳定运行时</h3>
          <p>页面最终由统一渲染链、DataSet/DataView 和权限链解释执行，减少“这次能跑、下次失控”的不确定性。</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon"><NavIcon name="MagicStick" :size="32" /></div>
          <h3>低维护升级成本</h3>
          <p>业务变化优先落在配置层，平台升级优先收敛在运行时，减少系统分叉、重复改造和跨项目回归成本。</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon"><NavIcon name="DataBoard" :size="32" /></div>
          <h3>多租户隔离</h3>
          <p>每个租户独立数据空间、配置空间和接口上下文，统一平台管理，避免不同客户需求相互污染。</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon"><NavIcon name="Lock" :size="32" /></div>
          <h3>多系统统一承载</h3>
          <p>同一个运行时承载多个项目和业务域，页面差异通过配置表达，不靠复制一套又一套代码仓库来扩展。</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon"><NavIcon name="OfficeBuilding" :size="32" /></div>
          <h3>权限与数据一体化</h3>
          <p>DataViewKey、DataRelation、_perm 和页面模式进入同一条渲染链，配置一次，就能稳定覆盖联动、权限和展示状态。</p>
        </div>
      </div>
    </section>

    <!-- ── 场景案例 ── -->
    <section class="scenarios">
      <h2 class="section-title">SaaS 数字化转型里的真实收益</h2>
      <p class="section-desc">从新系统交付到后续演进，真正决定成败的是长期成本，而不是第一次生成有多快</p>
      <div class="scenario-list">
        <div class="scenario-card">
          <div class="scenario-header">
            <span class="scenario-icon"><NavIcon name="Lightning" :size="20" /></span>
            <h3>新系统交付</h3>
          </div>
          <div class="scenario-body">
            <div class="scenario-old">
              <span class="scenario-tag">传统</span>
              新需求一来就新建页面、新写接口适配、新拼权限逻辑，越做系统越多，越多越难管
            </div>
            <div class="scenario-new">
              <span class="scenario-tag">SPARK</span>
              以租户、项目、页面配置为交付单位，先把系统结构组织出来，再由运行时统一承载和复用
            </div>
          </div>
        </div>
        <div class="scenario-card">
          <div class="scenario-header">
            <span class="scenario-icon"><NavIcon name="Share" :size="20" /></span>
            <h3>系统差异适配</h3>
          </div>
          <div class="scenario-body">
            <div class="scenario-old">
              <span class="scenario-tag">传统</span>
              每个客户、每个业务域都在原有系统上打补丁，最后变成多个相似但无法统一升级的分叉版本
            </div>
            <div class="scenario-new">
              <span class="scenario-tag">SPARK</span>
              差异优先通过配置表达，统一运行时持续复用，租户和系统边界明确但平台能力不重复建设
            </div>
          </div>
        </div>
        <div class="scenario-card">
          <div class="scenario-header">
            <span class="scenario-icon"><NavIcon name="Lock" :size="20" /></span>
            <h3>权限驱动渲染</h3>
          </div>
          <div class="scenario-body">
            <div class="scenario-old">
              <span class="scenario-tag">传统</span>
              满屏 v-if="hasPermission('edit')" + 角色 if/switch，换规则改一堆代码
            </div>
            <div class="scenario-new">
              <span class="scenario-tag">SPARK</span>
              后端 _perm 快照驱动，<strong>改权限不改代码</strong>——切换角色 = 切换数据
            </div>
          </div>
        </div>
        <div class="scenario-card">
          <div class="scenario-header">
            <span class="scenario-icon"><NavIcon name="MagicStick" :size="20" /></span>
            <h3>升级与迭代</h3>
          </div>
          <div class="scenario-body">
            <div class="scenario-old">
              <span class="scenario-tag">传统</span>
              平台一升级，就要逐系统查兼容、补分叉、回归验证，历史越久，升级越像拆弹
            </div>
            <div class="scenario-new">
              <span class="scenario-tag">SPARK</span>
              变化优先收敛到配置层，运行时和日志闭环负责托底，让升级更多发生在平台而不是业务代码里
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 全景对比表 ── -->
    <section class="comparison">
      <h2 class="section-title">全景对比</h2>
      <p class="section-desc">SPARK AppWorks vs 传统生成式开发平台（Copilot / Cursor / v0）</p>
      <div class="table-wrapper">
        <table class="compare-table">
          <thead>
            <tr>
              <th>对比维度</th>
              <th>传统生成平台</th>
              <th class="highlight-col">SPARK AppWorks</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>输出格式</td>
              <td>自由格式代码 (.vue/.tsx)</td>
              <td class="highlight-col">4 个标准化配置文件</td>
            </tr>
            <tr>
              <td>Token 效率</td>
              <td>~14.5KB / 页</td>
              <td class="highlight-col">~4.6KB / 页（约 1/3）</td>
            </tr>
            <tr>
              <td>验证方式</td>
              <td>编译器 + 运行时（秒级）</td>
              <td class="highlight-col">JSON Schema + 正则（毫秒级）</td>
            </tr>
            <tr>
              <td>迭代闭环</td>
              <td>手动复制报错给系统链路</td>
              <td class="highlight-col">Logger 自动收集 → 自动修复链路</td>
            </tr>
            <tr>
              <td>迭代速度</td>
              <td>2~5 分钟/轮（人工）</td>
              <td class="highlight-col">10~15 秒/轮（自动）</td>
            </tr>
            <tr>
              <td>数据绑定</td>
              <td>手写 ref / reactive / computed</td>
              <td class="highlight-col">DataViewKey配置（零代码）</td>
            </tr>
            <tr>
              <td>父子联动</td>
              <td>watch + API / 过滤逻辑</td>
              <td class="highlight-col">DataRelation 配置（零代码）</td>
            </tr>
            <tr>
              <td>权限控制</td>
              <td>v-if + 角色判断</td>
              <td class="highlight-col">_perm 快照驱动（改权限不改代码）</td>
            </tr>
            <tr>
              <td>计算列</td>
              <td>computed 属性</td>
              <td class="highlight-col">computeExpression（零代码）</td>
            </tr>
            <tr>
              <td>聚合汇总</td>
              <td>Array.reduce / lodash</td>
              <td class="highlight-col">aggregates 配置（零代码）</td>
            </tr>
            <tr>
              <td>结构理解深度</td>
              <td>需读 500+ 行混合代码</td>
              <td class="highlight-col">只需理解 120 行结构化配置</td>
            </tr>
            <tr>
              <td>页面生产效率</td>
              <td>1~3 天/页</td>
              <td class="highlight-col">10~30 分钟/页</td>
            </tr>
            <tr>
              <td>多租户隔离</td>
              <td>额外设计上下文和权限边界</td>
              <td class="highlight-col">tenant / project 维度内建隔离</td>
            </tr>
            <tr>
              <td>多系统承载</td>
              <td>复制项目后逐步分叉</td>
              <td class="highlight-col">统一运行时承载多个系统</td>
            </tr>
            <tr>
              <td>升级方式</td>
              <td>逐系统追差异、追兼容</td>
              <td class="highlight-col">优先升级平台运行时，业务变化留在配置层</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── 五层架构 ── -->
    <section class="architecture">
      <h2 class="section-title">五层配置交互体系</h2>
      <p class="section-desc">从配置生成闭环到多租户、多系统治理，递进覆盖</p>
      <div class="arch-stack">
        <div class="arch-layer arch-layer--5">
          <span class="arch-num">5</span>
          <div class="arch-content">
            <h4>企业数据资源目录</h4>
            <p>表结构 · 字典 · 命名规范 · 敏感字段模式</p>
          </div>
        </div>
        <div class="arch-layer arch-layer--4">
          <span class="arch-num">4</span>
          <div class="arch-content">
            <h4>查询协议</h4>
            <p>按需查询组件 Props · 表结构 · 字典 · DataViewKey帮助</p>
          </div>
        </div>
        <div class="arch-layer arch-layer--3">
          <span class="arch-num">3</span>
          <div class="arch-content">
            <h4>语义验证管线</h4>
            <p>L1 JSON 语法 → L2 DataViewKey格式 → L3 表引用 → L4 组件类型 → L5 脚本引用</p>
          </div>
        </div>
        <div class="arch-layer arch-layer--2">
          <span class="arch-num">2</span>
          <div class="arch-content">
            <h4>审核节点</h4>
            <p>数据资源审核（DB / 字典 / 安全）· UI 合规审核（组件 / 权限 / 脱敏）</p>
          </div>
        </div>
        <div class="arch-layer arch-layer--1">
          <span class="arch-num">1</span>
          <div class="arch-content">
            <h4>生成 + 迭代闭环</h4>
            <p>二阶段生成 → 写入文件 → 热更新 → 日志收集 → 迭代修正（≤ 3 轮）</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 工作流程 ── -->
    <section class="workflow">
      <h2 class="section-title">三步配出企业应用</h2>
      <p class="section-desc">从租户与系统，到可运行页面和可持续演进的平台资产</p>
      <div class="workflow-steps">
        <div class="step">
          <div class="step-number">1</div>
          <h3>选择租户与系统</h3>
          <p>明确本次交付属于哪个租户、哪个项目或业务域，把边界先定清楚。</p>
        </div>
        <div class="step-arrow">→</div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>配置页面资产</h3>
          <p>生成页面结构、数据模型、权限策略和最小化脚本，而不是无边界地生成代码。</p>
        </div>
        <div class="step-arrow">→</div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>稳定运行时生效</h3>
          <p>配置写入即运行，可继续预览、迭代、审阅和回滚，让交付资产长期可维护。</p>
        </div>
      </div>
    </section>

    <!-- ── 适用场景 ── -->
    <section class="fit">
      <h2 class="section-title">最佳实践：组合使用</h2>
      <p class="section-desc">用 SPARK 处理 80% 的"高度同质"页面，把精力释放给真正需要创造力的工作</p>
      <div class="fit-grid">
        <div class="fit-card fit-card--spark">
          <h4>SPARK AppWorks 主场</h4>
          <ul>
            <li><span class="fit-star">★★★★★</span> 中后台 CRUD</li>
            <li><span class="fit-star">★★★★★</span> 数据看板 / 聚合</li>
            <li><span class="fit-star">★★★★★</span> 树形主从联动</li>
            <li><span class="fit-star">★★★★★</span> 权限驱动页面</li>
            <li><span class="fit-star">★★★★★</span> 批量页面生成</li>
          </ul>
        </div>
        <div class="fit-card fit-card--trad">
          <h4>传统平台更合适</h4>
          <ul>
            <li><span class="fit-star">★★★★</span> 复杂交互动画</li>
            <li><span class="fit-star">★★★★</span> C 端创意页面</li>
            <li><span class="fit-star">★★★</span> 游戏 / 3D 渲染</li>
            <li><span class="fit-star">★★★★</span> 通用算法编程</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ── 底部 CTA ── -->
    <section class="cta">
      <h2>企业应用系统，不是堆代码堆出来的，而是配置驱动出来的</h2>
      <p>前提是所有变化都在受约束的配置空间里工作，而页面最终由稳定运行时解释执行。</p>
      <router-link to="/demo/custom-r-table" class="btn btn--primary btn--lg">
        直接看 Demo →
      </router-link>
    </section>

    <!-- ── 页脚 ── -->
    <footer class="home-footer">
      <span>© {{ year }} SPARK AppWorks — SPARK 融合平台 · 应用工场</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 平台首页，展示系统介绍、功能亮点和快速开始入口；属于平台路由页，不允许作为 SparkNode 组件配置生成。
 */
import NavIcon from '@/components/NavIcon.vue'

const year = new Date().getFullYear()

const platformDemos = [
  {
    path: '/demo/custom-r-table',
    badge: 'tree-demo',
    title: '树形导航编辑器',
    description: '展示树容器、表单编辑、工具栏动作、当前节点联动和页面脚本，最适合体现“配置驱动系统”的平台感。',
    points: [
      '树结构与节点编辑在同一页闭环工作',
      '更像真实系统配置页，而不是单一组件示例',
      '适合做首页首屏和录屏主镜头',
    ],
  },
  {
    path: '/demo/r-form-compare',
    badge: 'master-detail',
    title: '主从联动页面',
    description: '点击主表行自动切换子表数据，直接体现 DataView 驱动的零代码联动能力。',
    points: [
      '更贴近企业后台里的典型列表场景',
      '配置驱动的数据联动比手写 watch 更稳定',
      '适合说明为什么后续维护成本更低',
    ],
  },
] as const

function setRegisterTab() {
  sessionStorage.setItem('spark_login_tab', 'register-tenant')
}
</script>

<style scoped>
/* ── 全局 ── */
.home-page {
  min-height: 100vh;
  color: #1d1d1f;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow-x: hidden;
}

.section-title {
  text-align: center;
  font-size: 36px;
  font-weight: 700;
  margin: 0 0 8px;
}

.section-desc {
  text-align: center;
  font-size: 16px;
  color: #606266;
  margin: 0 0 60px;
}

/* ── Demo 展示 ── */
.demo-showcase {
  padding: 100px 48px;
  background: linear-gradient(180deg, #f6f1e8 0%, #f4f8fb 100%);
}

.demo-showcase__eyebrow {
  margin: 0 0 10px;
  text-align: center;
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.demo-showcase__desc {
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
}

.demo-showcase__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  max-width: 1320px;
  margin: 0 auto;
}

.demo-showcase__card {
  display: grid;
  gap: 18px;
  padding: 28px;
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.14), transparent 32%),
    rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.demo-showcase__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.demo-showcase__badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.1);
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.demo-showcase__path {
  color: #64748b;
  font-size: 13px;
  font-family: Consolas, 'Courier New', monospace;
}

.demo-showcase__card h3 {
  margin: 0;
  color: #0f172a;
  font-size: 24px;
}

.demo-showcase__card p {
  margin: 0;
  color: #475569;
  line-height: 1.7;
}

.demo-showcase__points {
  display: grid;
  gap: 10px;
  margin: 0;
  padding-left: 18px;
  color: #334155;
  line-height: 1.7;
}

.demo-showcase__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-width: 132px;
  padding: 12px 18px;
  border-radius: 999px;
  background: #0f172a;
  color: #f8fafc;
  text-decoration: none;
  font-weight: 600;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.demo-showcase__link:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  background: #111827;
}

/* ── Hero ── */
.hero {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
  color: #fff;
  position: relative;
  overflow: hidden;
}

.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 600px 400px at 20% 50%, rgba(102, 126, 234, 0.25), transparent),
    radial-gradient(ellipse 500px 350px at 75% 30%, rgba(118, 75, 162, 0.2), transparent);
  pointer-events: none;
}

.hero-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 48px;
  position: relative;
  z-index: 1;
}

.hero-logo {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 2px;
}

.hero-nav-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.nav-link {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.nav-link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}

.nav-link--primary {
  background: rgba(102, 126, 234, 0.5);
  color: #fff;
  backdrop-filter: blur(4px);
}

.nav-link--primary:hover {
  background: rgba(102, 126, 234, 0.7);
}

.hero-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 24px 80px;
  position: relative;
  z-index: 1;
}

.hero-eyebrow {
  margin: 0 0 18px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.84);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  backdrop-filter: blur(12px);
}

.hero-title {
  font-size: 52px;
  font-weight: 800;
  line-height: 1.25;
  margin: 0 0 24px;
}

.hero-highlight {
  background: linear-gradient(90deg, #667eea, #a78bfa, #fbbf24);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-desc {
  font-size: 17px;
  line-height: 1.8;
  opacity: 0.85;
  max-width: 640px;
  margin: 0 0 36px;
}

.hero-metrics {
  display: flex;
  align-items: center;
  gap: 32px;
  margin-bottom: 40px;
  padding: 20px 40px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  backdrop-filter: blur(12px);
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.metric-value {
  font-size: 32px;
  font-weight: 800;
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.metric-label {
  font-size: 13px;
  opacity: 0.7;
  white-space: nowrap;
}

.metric-divider {
  width: 1px;
  height: 40px;
  background: rgba(255, 255, 255, 0.15);
}

.hero-actions {
  display: flex;
  gap: 16px;
}

.hero-proof {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 28px;
}

.hero-proof-item {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.84);
  font-size: 13px;
  font-weight: 600;
  backdrop-filter: blur(10px);
}

/* ── 按钮 ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 32px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.25s;
  cursor: pointer;
  border: none;
}

.btn--lg {
  padding: 14px 40px;
  font-size: 16px;
}

.btn--primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
}

.btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(102, 126, 234, 0.55);
}

.btn--outline {
  background: transparent;
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.4);
}

.btn--outline:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

/* ── 范式对比 ── */
.paradigm {
  padding: 100px 48px;
  max-width: 1100px;
  margin: 0 auto;
}

.paradigm-compare {
  display: flex;
  align-items: stretch;
  gap: 24px;
}

.paradigm-card {
  flex: 1;
  border-radius: 16px;
  padding: 32px;
}

.paradigm-card--old {
  background: #f8f9fc;
  border: 1px solid #e4e7ed;
}

.paradigm-card--new {
  background: linear-gradient(135deg, #f0f0ff 0%, #faf5ff 100%);
  border: 1px solid #d4b8ff;
}

.paradigm-badge {
  display: inline-block;
  font-size: 13px;
  font-weight: 700;
  padding: 4px 14px;
  border-radius: 20px;
  margin-bottom: 20px;
}

.paradigm-card--old .paradigm-badge {
  background: #e4e7ed;
  color: #606266;
}

.paradigm-card--new .paradigm-badge {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.paradigm-vs {
  display: flex;
  align-items: center;
  font-size: 20px;
  font-weight: 800;
  color: #c0c4cc;
  flex-shrink: 0;
}

.paradigm-flow {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.flow-step {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.03);
}

.flow-step.warn {
  background: #fef3cd;
  color: #856404;
}

.flow-step.ok {
  background: #d4edda;
  color: #155724;
}

/* ── 四文件 ── */
.four-files {
  padding: 100px 48px;
  background: #f5f7fa;
}

.files-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

.file-card {
  background: #fff;
  border-radius: 14px;
  padding: 28px 24px;
  border: 1px solid #ebeef5;
  transition: all 0.3s;
}

.file-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
}

.file-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.file-ext {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.file-name {
  font-size: 15px;
  font-weight: 600;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.file-role {
  font-size: 13px;
  font-weight: 600;
  color: #764ba2;
  margin: 0 0 6px;
}

.file-desc {
  font-size: 13px;
  line-height: 1.7;
  color: #606266;
  margin: 0;
}

/* ── 配置闭环 ── */
.config-loop {
  padding: 100px 48px;
  max-width: 1100px;
  margin: 0 auto;
}

.loop-container {
  text-align: center;
}

.loop-track {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.loop-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  background: linear-gradient(135deg, #f0f0ff, #faf5ff);
  border: 1px solid #d4b8ff;
  border-radius: 14px;
  min-width: 150px;
}

.loop-icon {
  font-size: 28px;
}

.loop-label {
  font-size: 13px;
  font-weight: 600;
  color: #4a3a6a;
}

.loop-arrow {
  font-size: 24px;
  color: #764ba2;
  font-weight: 700;
}

.loop-caption {
  font-size: 14px;
  color: #909399;
  margin-bottom: 28px;
}

.loop-compare {
  display: flex;
  gap: 20px;
  justify-content: center;
}

.compare-item {
  padding: 14px 24px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
}

.compare-item--old {
  background: #fef3cd;
  color: #856404;
}

.compare-item--new {
  background: #d4edda;
  color: #155724;
}

.compare-tag {
  font-weight: 700;
  margin-right: 8px;
}

/* ── Features ── */
.features {
  padding: 100px 48px;
  background: #f5f7fa;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  max-width: 1100px;
  margin: 0 auto;
}

.feature-card {
  padding: 32px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #ebeef5;
  transition: all 0.3s;
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
}

.feature-icon {
  font-size: 36px;
  margin-bottom: 16px;
}

.feature-card h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
}

.feature-card p {
  font-size: 14px;
  line-height: 1.7;
  color: #606266;
  margin: 0;
}

/* ── 场景 ── */
.scenarios {
  padding: 100px 48px;
  max-width: 1100px;
  margin: 0 auto;
}

.scenario-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.scenario-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 14px;
  padding: 28px 32px;
  transition: all 0.3s;
}

.scenario-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.scenario-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.scenario-icon {
  font-size: 24px;
}

.scenario-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.scenario-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scenario-old,
.scenario-new {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
}

.scenario-old {
  background: #fafafa;
  color: #909399;
}

.scenario-new {
  background: #f0f9eb;
  color: #2d5a1e;
}

.scenario-tag {
  font-weight: 700;
  margin-right: 8px;
  font-size: 12px;
}

.scenario-old .scenario-tag {
  color: #c0c4cc;
}

.scenario-new .scenario-tag {
  color: #67c23a;
}

/* ── 对比表 ── */
.comparison {
  padding: 100px 48px;
  background: #f5f7fa;
}

.table-wrapper {
  max-width: 1000px;
  margin: 0 auto;
  overflow-x: auto;
}

.compare-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 12px;
  overflow: hidden;
  font-size: 14px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.compare-table th {
  padding: 16px 20px;
  text-align: left;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #f8f9fc;
  border-bottom: 2px solid #ebeef5;
}

.compare-table td {
  padding: 14px 20px;
  border-bottom: 1px solid #f0f2f5;
}

.compare-table tbody tr:last-child td {
  border-bottom: none;
}

.compare-table tbody tr:hover {
  background: #fafbfd;
}

.highlight-col {
  color: #5b21b6;
  font-weight: 500;
}

.compare-table th.highlight-col {
  background: linear-gradient(135deg, #f0f0ff, #faf5ff);
  color: #5b21b6;
}

/* ── 五层架构 ── */
.architecture {
  padding: 100px 48px;
  max-width: 800px;
  margin: 0 auto;
}

.arch-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.arch-layer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 24px;
  border-radius: 12px;
  color: #fff;
  transition: transform 0.2s;
}

.arch-layer:hover {
  transform: translateX(6px);
}

.arch-layer--5 { background: linear-gradient(90deg, #0f0c29, #302b63); }
.arch-layer--4 { background: linear-gradient(90deg, #302b63, #4a3f7a); }
.arch-layer--3 { background: linear-gradient(90deg, #4a3f7a, #667eea); }
.arch-layer--2 { background: linear-gradient(90deg, #667eea, #8b6ec6); }
.arch-layer--1 { background: linear-gradient(90deg, #8b6ec6, #a78bfa); }

.arch-num {
  font-size: 22px;
  font-weight: 800;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
}

.arch-content h4 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 2px;
}

.arch-content p {
  font-size: 13px;
  opacity: 0.85;
  margin: 0;
}

/* ── Workflow ── */
.workflow {
  padding: 100px 48px;
  background: #f5f7fa;
}

.workflow-steps {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.step {
  flex: 1;
  text-align: center;
  max-width: 260px;
}

.step-number {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.step h3 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px;
}

.step p {
  font-size: 14px;
  line-height: 1.7;
  color: #606266;
  margin: 0;
}

.step-arrow {
  font-size: 28px;
  color: #c0c4cc;
  padding-top: 16px;
  flex-shrink: 0;
}

/* ── 适用场景 ── */
.fit {
  padding: 100px 48px;
  max-width: 900px;
  margin: 0 auto;
}

.fit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.fit-card {
  border-radius: 14px;
  padding: 28px 32px;
}

.fit-card--spark {
  background: linear-gradient(135deg, #f0f0ff 0%, #faf5ff 100%);
  border: 1px solid #d4b8ff;
}

.fit-card--trad {
  background: #f8f9fc;
  border: 1px solid #e4e7ed;
}

.fit-card h4 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 16px;
}

.fit-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fit-card li {
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.fit-star {
  font-size: 11px;
  color: #fbbf24;
  letter-spacing: -1px;
  min-width: 60px;
}

/* ── CTA ── */
.cta {
  padding: 100px 48px;
  text-align: center;
  background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
  color: #fff;
}

.cta h2 {
  font-size: 36px;
  font-weight: 700;
  margin: 0 0 12px;
}

.cta p {
  font-size: 16px;
  opacity: 0.85;
  margin: 0 0 36px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

/* ── Footer ── */
.home-footer {
  padding: 24px 48px;
  text-align: center;
  font-size: 13px;
  color: #909399;
  background: #fafafa;
}

/* ── Dark Mode ── */
html.dark .home-page {
  color: #e5eaf3;
  background: #141414;
}

html.dark .paradigm-card--old {
  background: #1d1e1f;
  border-color: #303133;
}

html.dark .paradigm-card--new {
  background: #1a1a2e;
  border-color: #4a3a6a;
}

html.dark .flow-step {
  background: rgba(255, 255, 255, 0.04);
}

html.dark .flow-step.warn {
  background: #3a3000;
  color: #fbbf24;
}

html.dark .flow-step.ok {
  background: #0a2e14;
  color: #67c23a;
}

html.dark .four-files,
html.dark .features,
html.dark .comparison,
html.dark .workflow {
  background: #1a1a1a;
}

html.dark .file-card,
html.dark .feature-card,
html.dark .scenario-card {
  background: #1d1e1f;
  border-color: #303133;
}

html.dark .feature-card p,
html.dark .file-desc,
html.dark .step p,
html.dark .section-desc {
  color: #a3a6ad;
}

html.dark .scenario-old {
  background: #1d1e1f;
  color: #a3a6ad;
}

html.dark .scenario-new {
  background: #0a2e14;
  color: #67c23a;
}

html.dark .compare-table {
  background: #1d1e1f;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

html.dark .compare-table th {
  background: #252526;
  border-color: #303133;
}

html.dark .compare-table td {
  border-color: #252526;
}

html.dark .compare-table tbody tr:hover {
  background: #252526;
}

html.dark .compare-table th.highlight-col {
  background: #1a1a2e;
}

html.dark .highlight-col {
  color: #a78bfa;
}

html.dark .loop-node {
  background: #1a1a2e;
  border-color: #4a3a6a;
}

html.dark .loop-label {
  color: #c4b5fd;
}

html.dark .compare-item--old {
  background: #3a3000;
  color: #fbbf24;
}

html.dark .compare-item--new {
  background: #0a2e14;
  color: #67c23a;
}

html.dark .fit-card--spark {
  background: #1a1a2e;
  border-color: #4a3a6a;
}

html.dark .fit-card--trad {
  background: #1d1e1f;
  border-color: #303133;
}

html.dark .home-footer {
  background: #1a1a1a;
  color: #606266;
}

/* ── 响应式 ── */
@media (max-width: 768px) {
  .hero-eyebrow {
    letter-spacing: 0.12em;
    text-align: center;
  }

  .hero-title {
    font-size: 32px;
  }

  .hero-nav {
    padding: 16px 24px;
  }

  .hero-metrics {
    flex-direction: column;
    gap: 16px;
    padding: 16px 24px;
  }

  .hero-proof {
    gap: 10px;
  }

  .metric-divider {
    width: 60px;
    height: 1px;
  }

  .demo-showcase {
    padding: 60px 24px;
  }

  .demo-showcase__grid {
    grid-template-columns: 1fr;
  }

  .paradigm {
    padding: 60px 24px;
  }

  .paradigm-compare {
    flex-direction: column;
  }

  .paradigm-vs {
    justify-content: center;
  }

  .four-files {
    padding: 60px 24px;
  }

  .files-grid {
    grid-template-columns: 1fr 1fr;
  }

  .config-loop {
    padding: 60px 24px;
  }

  .loop-track {
    flex-direction: column;
  }

  .loop-arrow {
    transform: rotate(90deg);
  }

  .loop-compare {
    flex-direction: column;
    align-items: center;
  }

  .features {
    padding: 60px 24px;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .scenarios {
    padding: 60px 24px;
  }

  .comparison {
    padding: 60px 24px;
  }

  .architecture {
    padding: 60px 24px;
  }

  .workflow {
    padding: 60px 24px;
  }

  .workflow-steps {
    flex-direction: column;
    align-items: center;
  }

  .step-arrow {
    transform: rotate(90deg);
    padding: 0;
  }

  .fit {
    padding: 60px 24px;
  }

  .fit-grid {
    grid-template-columns: 1fr;
  }

  .cta {
    padding: 60px 24px;
  }
}

@media (max-width: 480px) {
  .demo-showcase {
    padding: 60px 16px;
  }

  .files-grid {
    grid-template-columns: 1fr;
  }
}
</style>
