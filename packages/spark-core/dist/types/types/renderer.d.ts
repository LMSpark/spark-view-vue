/**
 * 渲染器组件类型定义 - 核心包版本
 * 移除了对具体UI库的依赖，保持通用性
 */
export interface ColumnModel {
    field?: string;
    headerText?: string;
    width?: string | number;
    [key: string]: unknown;
}
export interface ComponentConfig {
    type: string;
    children?: ComponentConfig[];
    [key: string]: unknown;
}
export interface ComponentContext<TCol = unknown> {
    componentType: string;
    columns?: unknown;
    childColumns?: unknown;
    addColumn?: (column: TCol) => void;
    addChildColumn?: (column: TCol) => void;
    removeColumn?: (index: number) => void;
    removeChildColumn?: (index: number) => void;
    updateColumn?: (index: number, column: TCol) => void;
    updateChildColumn?: (index: number, column: TCol) => void;
}
export interface TemplateInfo {
    component?: unknown;
    props?: Record<string, unknown>;
    children?: ComponentConfig[];
}
export interface RenderResult {
    component: unknown;
    props: Record<string, unknown>;
    children: RenderResult[];
    context: ComponentContext<unknown> | unknown;
    config: ComponentConfig;
}
export interface ComponentRenderer<C extends ComponentContext<unknown> = ComponentContext<unknown>> {
    setup?(config: ComponentConfig): C;
    template?(config: ComponentConfig, context: C): TemplateInfo;
}
export interface RenderService {
    render(config: ComponentConfig): RenderResult;
}
