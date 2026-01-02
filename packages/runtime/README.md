# @spark-view/runtime

Client-side runtime for SPARK.View with partial hydration support.

## Features

- **Partial Hydration**: idle/visible/interaction strategies
- **IntersectionObserver**: Automatic visible detection
- **Priority-based**: critical/high/normal/low
- **Event-driven**: Custom hydration events

## Quick Start

```typescript
import { hydratePartial } from '@spark-view/runtime';

// Start partial hydration
hydratePartial({
  hints: window.__HYDRATION_HINTS__,
  strategy: 'progressive',
});
```

## Strategies

### immediate

Hydrate immediately on page load.

```yaml
hydration:
  strategy: immediate
  priority: critical
```

### idle

Hydrate when browser is idle (requestIdleCallback).

```yaml
hydration:
  strategy: idle
  priority: normal
```

### visible

Hydrate when component enters viewport.

```yaml
hydration:
  strategy: visible
  priority: low
  viewport:
    rootMargin: "50px"
    threshold: 0.1
```

### interaction

Hydrate on user interaction (click/hover).

```yaml
hydration:
  strategy: interaction
  priority: normal
```

### never

Never hydrate (static content).

```yaml
hydration:
  strategy: never
```

## API

### hydratePartial(options)

Start partial hydration.

```typescript
interface HydrationOptions {
  hints: HydrationHint[];
  strategy?: 'progressive' | 'all';
  timeout?: number;
}
```

### Events

Listen for hydration events:

```typescript
document.addEventListener('hydrated', (e) => {
  console.log(`Component ${e.detail.id} hydrated`);
});
```

## License

MIT
