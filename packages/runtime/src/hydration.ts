/**
 * 客户端部分水合运行时
 */

// import { createApp, h } from 'vue';

export interface HydrationOptions {
  hints: HydrationHint[];
  strategy?: 'progressive' | 'all';
  timeout?: number;
}

export interface HydrationHint {
  id: string;
  strategy: 'immediate' | 'idle' | 'visible' | 'interaction' | 'never';
  priority?: 'critical' | 'high' | 'normal' | 'low';
  trigger?: string;
  viewport?: {
    rootMargin?: string;
    threshold?: number;
  };
}

export class PartialHydration {
  private hints: HydrationHint[];
  private hydratedIds = new Set<string>();
  private intersectionObserver?: IntersectionObserver;

  constructor(options: HydrationOptions) {
    this.hints = options.hints || [];
    this.setupObservers();
  }

  /**
   * 启动部分水合
   */
  start(): void {
    // 按策略分组
    const byStrategy = this.groupByStrategy();

    // immediate: 立即水合
    if (byStrategy.immediate.length > 0) {
      this.hydrateComponents(byStrategy.immediate);
    }

    // idle: 空闲时水合
    if (byStrategy.idle.length > 0) {
      this.hydrateOnIdle(byStrategy.idle);
    }

    // visible: 可见时水合
    if (byStrategy.visible.length > 0) {
      this.hydrateOnVisible(byStrategy.visible);
    }

    // interaction: 交互触发
    if (byStrategy.interaction.length > 0) {
      this.hydrateOnInteraction(byStrategy.interaction);
    }
  }

  private groupByStrategy(): Record<string, HydrationHint[]> {
    const result: Record<string, HydrationHint[]> = {
      immediate: [],
      idle: [],
      visible: [],
      interaction: [],
      never: [],
    };

    for (const hint of this.hints) {
      result[hint.strategy].push(hint);
    }

    return result;
  }

  private hydrateComponents(hints: HydrationHint[]): void {
    for (const hint of hints) {
      if (this.hydratedIds.has(hint.id)) continue;

      const element = document.querySelector(`[data-hydration-id="${hint.id}"]`);
      if (element) {
        this.hydrateElement(element as HTMLElement, hint);
      }
    }
  }

  private hydrateOnIdle(hints: HydrationHint[]): void {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        this.hydrateComponents(hints);
      });
    } else {
      setTimeout(() => {
        this.hydrateComponents(hints);
      }, 1000);
    }
  }

  private hydrateOnVisible(hints: HydrationHint[]): void {
    for (const hint of hints) {
      const element = document.querySelector(`[data-hydration-id="${hint.id}"]`);
      if (!element) continue;

      this.intersectionObserver?.observe(element);
    }
  }

  private hydrateOnInteraction(hints: HydrationHint[]): void {
    for (const hint of hints) {
      const element = document.querySelector(`[data-hydration-id="${hint.id}"]`);
      if (!element) continue;

      const events = ['click', 'touchstart', 'mouseenter'];
      const handler = () => {
        this.hydrateElement(element as HTMLElement, hint);
        events.forEach((event) => element.removeEventListener(event, handler));
      };

      events.forEach((event) => element.addEventListener(event, handler, { once: true }));
    }
  }

  private hydrateElement(element: HTMLElement, hint: HydrationHint): void {
    if (this.hydratedIds.has(hint.id)) return;

    console.log(`Hydrating component: ${hint.id} (strategy: ${hint.strategy})`);

    // 这里应该加载并挂载对应的 Vue 组件
    // 简化实现：添加 class 表示已水合
    element.classList.add('hydrated');
    this.hydratedIds.add(hint.id);

    // 触发自定义事件
    element.dispatchEvent(
      new CustomEvent('hydrated', {
        detail: { id: hint.id, strategy: hint.strategy },
      })
    );
  }

  private setupObservers(): void {
    // 设置 IntersectionObserver
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            const id = element.getAttribute('data-hydration-id');
            const hint = this.hints.find((h) => h.id === id);

            if (hint) {
              this.hydrateElement(element, hint);
              this.intersectionObserver?.unobserve(element);
            }
          }
        }
      },
      {
        rootMargin: '50px',
        threshold: 0.1,
      }
    );
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.intersectionObserver?.disconnect();
  }
}

/**
 * 便捷导出
 */
export function hydratePartial(options: HydrationOptions): PartialHydration {
  const hydration = new PartialHydration(options);
  hydration.start();
  return hydration;
}
