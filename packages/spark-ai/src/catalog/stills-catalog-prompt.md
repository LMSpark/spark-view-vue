## 可用组件目录（Stills Catalog）

共 122 个组件，构建时间 2026-04-07T15:32:46.875Z

### 容器组件 (12)

| type | description | props |
|------|-------------|-------|
| r-block | 块容器（轻量分区） | title, description, props.docks.header.class, bordered, useCard, gridColumns, gridGap, gridAutoRows |
| r-collapse | 折叠面板容器，基于 el-collapse 管理子面板（r-collapse-item）的展开与折叠状态。 | modelValue, type, props, id, props.docks.toolbar.position, props.docks.toolbar.class, onChange |
| r-detail | 数据详情容器，基于 el-form 以只读模式展示 DataView.currentRow 字段值，与 r-form 结构一致但不可编辑。 | dataKey, gridColumns, gridGap, gridAutoRows, titleAlign, valueAlign, type, props, id, props.docks.toolbar.position, props.docks.toolbar.class |
| r-dialog | 对话框容器，基于 el-dialog 弹出模态窗口，支持 r-header/r-footer dock 和网格主体布局。 | header, footer, title, modelValue, bodyClass, gridColumns, gridGap, gridAutoRows, type, props, id, props.docks.header.class, props.docks.footer.class, onOpen, onClose, onOpened, onClosed |
| r-drawer | 抽屉容器，基于 el-drawer 侧滑面板，支持 r-header/r-footer dock 和网格主体布局。 | header, footer, title, modelValue, bodyClass, gridColumns, gridGap, gridAutoRows, type, props, id, props.docks.header.class, props.docks.footer.class |
| r-form | 数据表单容器，基于 el-form 绑定 DataView.currentRow 实现字段双向编辑，通过 CONTEXT_DATA 能力向子组件暴露表单数据。 | dataKey, labelWidth, gridColumns, gridGap, gridAutoRows, type, props, id, props.docks.toolbar.position, props.docks.toolbar.class |
| r-list | 列表容器，绑定 DataView.rows 以 CSS Grid 网格卡片布局渲染数据项，支持项选择和操作区域。 | dataKey, actions, columns, gap, minItemWidth, rowKey, emptyText, itemClass, itemStyle, useCard, cardShadow, gridColumns, gridGap, gridAutoRows, itemColSpan, itemRowSpan, type, props, id, props.docks.toolbar.position, props.docks.toolbar.class, props.docks.actions.position, props.docks.actions.class |
| r-section | 分区容器（别名 r-block），可选 el-card 包装，支持标题/描述/折叠/头部操作 dock。 | header, title, description, collapsible, defaultCollapsed, bordered, useCard, cardShadow, bodyClass, expandText, collapseText, showToggleIcon, expandIconText, collapseIconText, gridColumns, gridGap, gridAutoRows, type, props, id, props.docks.header.class |
| r-steps | 步骤条容器，基于 el-steps 管理多步骤流程的激活状态，支持工具栏 dock 和步骤内容切换。 | modelValue, type, props, id, props.docks.toolbar.position, props.docks.toolbar.class, onStepChange |
| r-table | 数据表格容器，基于 el-table 绑定 DataView 渲染行数据，支持工具栏/筛选区/行操作等 dock 区域，自动同步当前行和选中行状态。 | dataKey, actions, type, props, id, on.rowDblclick |
| r-tabs | 标签页容器，基于 el-tabs 管理多标签切换和激活状态，支持工具栏 dock。 | modelValue, type, props, id, props.docks.toolbar.position, props.docks.toolbar.class, onTabChange, onTabClick |
| r-tree | 树形容器，基于 el-tree 绑定 DataView 渲染嵌套树结构，支持懒加载、节点操作和编辑器（r-editor dock）侧面板。 | dataKey, actions, editor, nodeKey, currentKey, expandToKey, expandLevel, allowAppend, allowDelete, type, props, id, dataView, props.docks.toolbar.position, props.docks.toolbar.class, onNodeClick, onNodeExpand, onNodeCollapse |

### 字段组件 (50)

| type | description | props |
|------|-------------|-------|
| r-anchor | 锚点导航容器，基于 el-anchor 提供页面内锚点定位和跟随滚动高亮。 | container, offset, bound, duration, marker, direction, anchorType, type, props, id |
| r-anchor-link | 锚点链接项，基于 el-anchor-link 定义锚点 href 和显示标题，支持嵌套子链接。 | href, title, type, props, id |
| r-autocomplete | 自动补全输入字段，绑定 string 值，基于 el-autocomplete 提供输入建议和搜索匹配。 | field, label, width, modelValue, placeholder, fetchSuggestions, triggerOnFocus, highlightFirstItem, clearable, valueKey, type, props, id |
| r-button | 按钮组件，基于 el-button 可渲染子内容，支持 type/size/icon 等样式属性和点击事件。 | label, buttonType, buttonSize, plain, textMode, bg, linkMode, round, circle, loading, autoInsertSpace, color, dark, type, props, id |
| r-card | 卡片容器，基于 el-card 提供带可选头部的容器，在卡片体内渲染子组件。 | header, shadow, bodyStyle, bodyClass, type, props, id |
| r-cascader | 级联选择字段，绑定路径数组值，基于 el-cascader 支持多级分类选择、多选和搜索过滤。 | field, label, width, modelValue, options, optionKey, optionLabelField, optionValueField, optionChildrenField, placeholder, clearable, filterable, multiple, checkStrictly, emitPath, type, props, id |
| r-check-tag | 标签选择字段，绑定 boolean 值，基于 el-check-tag 提供可切换的标签选中状态。 | checked, label, type, props, id |
| r-checkbox | 单个复选框字段，绑定 boolean 值，基于 el-checkbox，支持自定义选中/未选中显示文本。 | field, label, width, modelValue, checkedText, uncheckedText, checkboxText, type, props, id |
| r-checkbox-group | 复选框组字段，绑定数组值，基于 el-checkbox-group 支持多选，可切换按钮样式。 | field, label, width, modelValue, options, optionKey, optionLabelField, optionValueField, buttonStyle, type, props, id |
| r-collapse-item | 折叠面板项，基于 el-collapse-item 提供可折叠区块，面板体内以 24 列网格渲染子组件。 | type, props, id, name, title, label, disabled, bodyClass, gridColumns, gridAutoRows, gridGap, index |
| r-color | 颜色选择字段，绑定十六进制颜色字符串，基于 el-color-picker，表格/详情模式显示色块预览。 | field, label, width, modelValue, type, props, id |
| r-context-renderer | 语境感知字段渲染代理，根据父容器类型（table/form/detail/tree）自动切换渲染模板，统一处理权限控制和校验规则。 | displayLabel, label, fieldName, field, width, sortable, filterable, minWidth, fixed, align, headerAlign, isCurrentFieldHidden, shouldRenderCurrentField, currentDisplayValue, isTableCellHidden, getTableCellDisplayValue, validationRules, titleAlign, valueAlign, headerCellClassName, labelClassName, cellClassName, className, titleClassName, valueClassName, type, props, id |
| r-date | 日期选择字段，绑定日期/字符串值，基于 el-date-picker 支持年/月/日/日期时间/范围等多种模式。 | field, label, width, modelValue, dateType, placeholder, startPlaceholder, endPlaceholder, rangeSeparator, format, valueFormat, clearable, filterMode, filterVariant, filterRange, type, props, id |
| r-dept-picker | 部门选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择部门。 | name, label, width, modelValue, placeholder, field, options, optionKey, optionLabelField, optionValueField, buttonText, readonlyButtonText, clearable, multiple, searchable, separator, valueMode, entityName, checkStrictly, showPath |
| r-divider | 分割线组件，基于 el-divider 在布局中插入水平或垂直分隔，支持文字内容定位。 | direction, borderStyle, contentPosition, content, type, props, id |
| r-dropdown | 下拉菜单容器，基于 el-dropdown 渲染触发器和菜单项，支持分裂按钮模式和命令事件。 | items, trigger, effect, placement, hideOnClick, showTimeout, hideTimeout, splitButton, popperClass, maxHeight, type, props, id |
| r-entity-picker | 通用实体选择器字段，绑定实体对象或 ID 值，弹窗选择单个或多个实体记录。 | field, label, width, modelValue, options, optionKey, optionLabelField, optionValueField, placeholder, buttonText, readonlyButtonText, clearable, multiple, searchable, separator, valueMode, entityName, type, props, id |
| r-file-browser | 文件浏览器字段，绑定文件路径字符串，弹窗式文件选择，支持 MIME 类型过滤和目录浏览。 | field, label, width, modelValue, accept, multiple, clearable, separator, placeholder, buttonText, type, props, id |
| r-file-path | 文件上传路径字段，绑定文件路径字符串，支持单/多文件上传并返回服务端路径。 | field, label, width, modelValue, action, accept, multiple, separator, placeholder, buttonText, readonlyButtonText, clearable, type, props, id |
| r-html-editor | 富文本编辑器字段，绑定 HTML 字符串值，内置加粗/斜体/列表工具栏和 HTML 源码编辑模式。 | field, label, width, modelValue, rows, type, props, id |
| r-icon | 图标选择字段，绑定图标名称字符串，基于 el-select 在下拉列表中提供可视化图标预览选择。 | field, label, width, modelValue, options, optionKey, optionLabelField, optionValueField, placeholder, clearable, filterable, classPrefix, type, props, id |
| r-image | 图片上传字段，绑定图片路径字符串，支持图片上传和缩略图预览显示。 | field, label, width, modelValue, action, accept, multiple, separator, placeholder, buttonText, readonlyButtonText, clearable, type, props, id |
| r-link | 链接组件，基于 el-link 提供带样式的超链接，可渲染子内容。 | label, linkType, underline, href, target, type, props, id |
| r-mention | 提及输入字段，绑定 string 值，基于 el-mention 支持 @ 前缀触发用户或实体搜索选择。 | modelValue, options, prefix, split, filterOption, placement, showArrow, offset, whole, checkIsWhole, loading, inputType, placeholder, rows, type, props, id |
| r-multi-select | 多选下拉字段，绑定数组值，基于 el-select multiple 模式，支持标签折叠（collapseTags）显示。 | field, label, width, modelValue, options, optionKey, optionLabelField, optionValueField, placeholder, clearable, filterable, collapseTags, collapseTagsTooltip, maxCollapseTags, type, props, id |
| r-number | 数字输入字段，绑定 number 值，基于 el-input-number，筛选模式下支持范围（最小-最大）双输入。 | field, label, width, modelValue, min, max, precision, filterMode, filterVariant, filterRange, type, props, id |
| r-page-header | 页面头部组件，基于 el-page-header 提供标题区、返回按钮和内容区域。 | title, icon, content, type, props, id |
| r-popconfirm | 确认气泡组件，基于 el-popconfirm 在目标元素上弹出确认/取消操作提示。 | title, confirmButtonText, cancelButtonText, confirmButtonType, cancelButtonType, icon, iconColor, hideIcon, hideAfter, width, type, props, id |
| r-popover | 弹出提示容器，基于 el-popover 为触发元素显示浮层内容，支持多种触发方式和位置。 | title, content, placement, width, trigger, effect, offset, showAfter, hideAfter, showArrow, popperClass, type, props, id |
| r-product-picker | 产品选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择产品。 | name, label, width, modelValue, placeholder, field, options, optionKey, optionLabelField, optionValueField, buttonText, readonlyButtonText, clearable, multiple, searchable, separator, valueMode, entityName, categoryFilter, showStock |
| r-radio | 单选按钮组字段，绑定 string/number 值，基于 el-radio-group，可切换按钮样式渲染。 | field, label, width, modelValue, options, optionKey, optionLabelField, optionValueField, buttonStyle, type, props, id |
| r-rate | 评分字段，绑定 number 值，基于 el-rate 提供星级评分交互，支持半星模式。 | field, label, width, modelValue, max, allowHalf, type, props, id |
| r-segmented | 分段选择器字段，绑定 string/number 值，基于 el-segmented 提供紧凑的互斥选项切换。 | modelValue, options, size, block, type, props, id |
| r-select | 单选下拉字段，绑定 string/number 值，基于 el-select，支持静态选项列表或 optionKey 动态数据源绑定。 | field, label, width, modelValue, options, optionKey, optionLabelField, optionValueField, placeholder, clearable, filterable, type, props, id |
| r-slider | 滑块字段，绑定 number 值，基于 el-slider 支持最小/最大/步长控制及输入框辅助。 | field, label, width, modelValue, min, max, step, showInput, type, props, id |
| r-space | 间距容器，使用 flex 布局为子组件提供均匀的水平或垂直间距，支持换行和填充。 | direction, size, wrap, fill, alignment, type, props, id |
| r-step-item | 步骤项组件（r-steps 内部），双模式渲染：步骤头部（el-step）和步骤内容区（24 列网格）。 | type, props, id, title, label, description, status, disabled, bodyClass, gridColumns, gridAutoRows, gridGap, index, mode |
| r-switch | 开关字段，绑定 boolean 值，基于 el-switch 提供状态切换，支持自定义开/关文本说明。 | field, label, width, modelValue, activeText, inactiveText, type, props, id |
| r-tab-pane | 标签页面板（r-tabs 内部），基于 el-tab-pane 在标签页体内以 24 列网格渲染子组件。 | type, props, id, name, value, label, title, disabled, lazy, closable, bodyClass, gridColumns, gridAutoRows, gridGap, index |
| r-text | 文本输入字段，绑定 string 值，基于 el-input 提供单行文本编辑能力。 | field, label, width, modelValue, type, props, id |
| r-textarea | 多行文本字段，绑定 string 值，基于 el-input textarea 模式，支持自动高度和字数限制。 | field, label, width, modelValue, rows, autosize, maxlength, showWordLimit, placeholder, type, props, id |
| r-time-picker | 时间选择字段，绑定时间字符串或 Date 值，基于 el-time-picker 支持时间范围选择。 | field, label, width, modelValue, placeholder, isRange, rangeSeparator, startPlaceholder, endPlaceholder, arrowControl, format, clearable, type, props, id |
| r-time-select | 时间间隔选择字段，绑定时间字符串值，基于 el-time-select 提供固定间隔的时间列表选择。 | field, label, width, modelValue, placeholder, start, end, step, minTime, maxTime, clearable, type, props, id |
| r-toolbar | 工具栏容器，flex 水平布局分为起始区（默认 children）和尾部区（r-tail dock），组织操作按钮。 | tail, gap, zoneGap, align, justify, type, props, id |
| r-tooltip | 文字提示组件，基于 el-tooltip 为子组件添加悬浮提示信息，支持位置和延迟配置。 | content, placement, effect, offset, showAfter, hideAfter, showArrow, enterable, popperClass, rawContent, type, props, id |
| r-tour | 引导流程组件，基于 el-tour 定义多步骤引导目标和说明文字，管理引导打开/关闭状态。 | steps, open, placement, showArrow, mask, tourType, closeOnPressEscape, scrollIntoViewOptions, type, props, id |
| r-transfer | 穿梭框字段，绑定数组值，基于 el-transfer 提供双面板列表项转移选择，支持搜索过滤。 | field, label, width, modelValue, options, optionKey, optionLabelField, optionValueField, titles, filterable, filterPlaceholder, targetOrder, type, props, id |
| r-tree-select | 树形选择字段，绑定单值或数组，基于 el-tree-select 支持树形层级结构选择、多选和懒加载。 | field, label, width, modelValue, options, optionKey, optionLabelField, optionValueField, optionChildrenField, placeholder, clearable, filterable, multiple, checkStrictly, defaultExpandAll, renderAfterExpand, type, props, id |
| r-upload | 文件上传字段，绑定文件路径字符串，基于 el-upload 支持列表/图片/卡片等多种文件展示模式。 | field, label, width, modelValue, action, accept, buttonText, autoUpload, showFileList, limit, listType, separator, placeholder, readonlyButtonText, type, props, id |
| r-user-picker | 用户选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择用户。 | name, label, width, modelValue, placeholder, field, options, optionKey, optionLabelField, optionValueField, buttonText, readonlyButtonText, clearable, multiple, searchable, separator, valueMode, entityName, deptScope, includeDisabled |

### 分组组件 (1)

| type | description | props |
|------|-------------|-------|
| r-column-group |  |  |

### 元概念 (2)

| type | description | props |
|------|-------------|-------|
| builtin-action | 声明式动作节点（零代码优先） | type, props.builtinAction |
| context-aware-fields-api | 语境感知字段渲染能力总览 |  |

### 功能组件 (57)

| type | description | props |
|------|-------------|-------|
| about | 关于页面，展示系统版本、技术栈和项目信息。 |  |
| ai-assistant-hub | SPARK 组件，可在注册表中通过 type="ai-assistant-hub" 使用。 |  |
| ai-chat-panel | SPARK 组件，可在注册表中通过 type="ai-chat-panel" 使用。 | embedded, forceOpen |
| ai-chat-widget | SPARK 组件，可在注册表中通过 type="ai-chat-widget" 使用。 | mode, systemPrompt, title, placeholder, compact |
| ai-studio-panel | AI 工作室面板，提供 AI 对话驱动的页面生成、迭代和预览功能。 |  |
| app-list | 应用列表页面，以卡片网格展示已创建的项目/应用及入口。 |  |
| builtin-action-button | 内置操作按钮，基于 el-button 根据 action 类型（create/edit/delete/refresh 等）自动映射标签、图标和样式。 | builtinAction, label, buttonType, buttonSize, buttonPlain, buttonText, buttonLink, buttonClass, buttonDisabled, disabled, disabledWhenRow, row, rowIndex, data, dataSource, type, props, id |
| cache-manager | 缓存管理页面，查看缓存统计信息并支持手动清理元数据缓存。 |  |
| capability-demo | 能力系统演示页，展示 sparkProvide/sparkConsume 能力链的运行时行为。 |  |
| custom-rtable-demo | 自定义表格演示，展示 r-table children 桥接机制和自定义列渲染能力。 |  |
| dashboard | 管理仪表盘，聚合展示关键业务指标、统计图表和快速操作入口。 |  |
| dev-system | 集成开发环境，提供页面配置可视化编辑、代码编辑、预览和版本管理。 |  |
| display-alert | 警告提示组件，基于 el-alert 显示带图标的提示信息，支持 success/warning/info/error 四种类型。 | title, description, alertType, closable, closeText, center, showIcon, effect, type, props, id |
| display-avatar | 头像展示组件，基于 el-avatar 显示用户头像或文字缩写，支持图片/图标/文字多种模式和尺寸配置。 | avatarSize, shape, src, value, field, srcSet, alt, fit, text, icon, type, props, id |
| display-badge | 徽章展示组件，基于 el-badge 在子内容上叠加数字或状态点标记。 | badgeValue, value, field, max, isDot, hiddenBadge, badgeType, showZero, color, offset, badgeStyle, badgeClass, type, props, id |
| display-breadcrumb | 面包屑导航容器，基于 el-breadcrumb 渲染多级导航路径，支持自定义分隔符。 | separator, separatorIcon, type, props, id |
| display-breadcrumb-item | 面包屑导航项，基于 el-breadcrumb-item 定义单个导航节点，支持链接跳转。 | label, to, replace, type, props, id |
| display-calendar | 日历展示组件，基于 el-calendar 显示月历视图，支持日期范围和选中绑定。 | modelValue, range, type, props, id |
| display-countdown | 倒计时组件，基于 el-countdown 显示目标时间倒计时，支持自定义格式和结束事件。 | value, format, prefix, suffix, title, valueStyle, type, props, id |
| display-descriptions | 描述列表容器，基于 el-descriptions 以键值对布局展示结构化信息。 | title, extra, border, column, direction, descriptionsSize, type, props, id |
| display-descriptions-item | 描述列表项，基于 el-descriptions-item 定义标签和内容值，支持字段绑定。 | label, span, labelAlign, contentAlign, labelClassName, className, content, value, field, type, props, id |
| display-empty | 空状态占位组件，基于 el-empty 显示自定义空状态图片和描述文字。 | image, imageSize, description, type, props, id |
| display-icon | 图标展示组件，解析图标名称渲染为 Element Plus 图标组件，支持尺寸和颜色配置。 | icon, iconSize, color, type, props, id |
| display-image | 图片展示组件，基于 el-image 显示图片，支持懒加载、预览画廊和加载占位。 | src, field, value, fit, alt, lazy, previewSrcList, previewField, initialIndex, zIndex, hideOnClickModal, previewTeleported, closeOnPressEscape, width, height, type, props, id |
| display-pagination | 分页控制组件，基于 el-pagination 从 DataView 同步分页状态，触发页码/页大小变更事件。 | total, pageSize, currentPage, pageSizes, pagerCount, layout, background, small, hideOnSinglePage, type, props, id |
| display-progress | 进度条展示组件，基于 el-progress 以条形或圆形显示百分比进度值，支持动态颜色。 | percentage, value, field, progressType, strokeWidth, textInside, status, indeterminate, duration, color, circleWidth, showText, strokeLinecap, formatText, type, props, id |
| display-result | 结果页组件，基于 el-result 显示操作结果状态（成功/警告/信息/错误），含标题、副标题和按钮区。 | icon, title, subTitle, type, props, id |
| display-skeleton | 骨架屏加载占位组件，基于 el-skeleton 显示内容加载中的占位动画效果。 | rows, count, loading, animated, throttle, type, props, id |
| display-statistic | 统计数值展示组件，基于 el-statistic 格式化显示数字/字符串值，支持精度、前后缀和千分位分隔。 | title, value, dataKey, field, precision, decimalSeparator, groupSeparator, prefix, suffix, valueStyle, type, props, id |
| display-tag | 标签展示组件，基于 el-tag 以彩色标签显示字段值，支持类型/尺寸/主题样式和可关闭功能。 | content, value, field, tagType, closable, disableTransitions, hit, round, color, size, effect, type, props, id |
| display-text | 文本展示组件，以 div/span/p 等 HTML 元素渲染文本值，支持前后缀和数字/货币/百分比/日期格式化。 | value, field, tag, prefix, suffix, format, precision, placeholder, textClass, textStyle, type, props, id |
| display-timeline | 时间线容器，基于 el-timeline 以垂直时间轴渲染事件序列。 | type, props, id |
| display-timeline-item | 时间线项，基于 el-timeline-item 定义时间戳、内容和状态标记点。 | timestamp, hideTimestamp, center, placement, itemType, color, itemSize, hollow, content, type, props, id |
| dock-actions | 操作列/区域 dock，在 r-table 中作为操作列提取渲染，独立使用时以 flex 布局渲染操作按钮。 | type, id, position, label, width, align, fixed |
| dock-editor | 编辑面板 dock，在 r-tree 中作为侧边编辑面板提取渲染，用于节点详情编辑。 | type, id, position, width |
| dock-filter | 筛选区 dock，在 r-table 中作为筛选表单区域提取渲染，支持折叠和网格布局。 | type, id, columns, collapsible, defaultCollapsed, autoFitMinWidth, itemSpan, gridColumns, gridGap, gridAutoRows |
| dock-footer | 底部 dock，在 r-dialog/r-drawer 中作为底部操作区域提取渲染。 | type, id, width |
| dock-header | 头部 dock，在 r-dialog/r-drawer/r-section 中作为顶部操作区域提取渲染。 | type, id, width |
| dock-tail | 尾部 dock，在 r-toolbar 中作为工具栏末尾区域提取渲染。 | type, id, width |
| error-fallback | SPARK 组件，可在注册表中通过 type="error-fallback" 使用。 | error |
| home-page | 平台首页，展示系统介绍、功能亮点和快速开始入口。 |  |
| icon-picker | SPARK 组件，可在注册表中通过 type="icon-picker" 使用。 | modelValue, placeholder, width |
| json-tree-editor | JSON 树形编辑器，基于 VXE-Table 以可折叠/展开的树结构编辑 JSON 数据。 | field, label, width, modelValue, documentValue, height, readOnly, schema, filterPlaceholder, policy, rootLabel, isProtected, canEditKey, canEditType, suggestChildKey, createDefaultArrayItem, createDefaultObjectValue, type, props, id |
| login-view | 多租户登录页面，提供用户名/密码认证和租户选择入口。 |  |
| module-context-badge | SPARK 组件，可在注册表中通过 type="module-context-badge" 使用。 | label, emptyText |
| nav-icon | SPARK 组件，可在注册表中通过 type="nav-icon" 使用。 | name, size |
| rform-compare-demo | 表单渲染对比演示，对比配置驱动 r-form 与手写模板两种表单实现方式。 |  |
| settings | 系统设置面板，提供全局参数配置和偏好设置管理界面。 |  |
| spark-child | 子节点渲染包装器，渲染单个 SparkNode 子节点，支持 CSS Grid 项包装以兼容 el-table-column 嵌套。 | type, id, nodeId, colSpan, rowSpan |
| spark-code-editor | 代码编辑器组件，基于 CodeMirror 6 提供语法高亮编辑，加载失败时回退为 textarea。 | modelValue, language, readOnly, height, tabSize, lineWrapping |
| spark-component-renderer | 通用组件渲染器，将 SparkNode 配置递归解析并动态渲染为已注册的 Vue 组件，是 SPARK 渲染引擎的核心入口。 | parentContext |
| spark-json-editor | JSON 编辑器组件，基于 CodeMirror 集成 JSON Schema 校验和树形视图，用于配置数据编辑。 | modelValue, readOnly, height, mode, indentation, tabSize, mainMenuBar, navigationBar, statusBar, askToFormat, schema, schemaDefinitions, enableSchemaValidation, enableSchemaEnumRenderer |
| template-dsl-demo | Vue 模板 DSL 演示页，展示通过 Vue SFC 模板直接使用 SPARK 组件的用法。 |  |
| tenant-config | 多租户配置管理页面，展示和编辑租户级别的系统配置项。 |  |
| tree-node-summary | 树节点摘要展示组件，在 r-tree 场景中渲染节点名称、类型、状态等多字段信息。 | nameField, typeField, statusField, ownerField, metaField, extraField, showType, showStatus, showOwner, showMeta, showExtra, type, props, id |
| unregistered-node-fallback | 未注册组件兜底渲染器，在开发阶段显示未找到对应注册的组件类型名称，辅助排查配置错误。 | title, description |
