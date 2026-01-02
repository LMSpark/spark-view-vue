# @spark-view/ssr-server

Express-based SSR server with caching and streaming support.

## Features

- **Caching**: Memory cache (extendable to Redis)
- **Streaming SSR**: renderToNodeStream support
- **Error handling**: Graceful degradation to CSR
- **Health checks**: `/health` endpoint
- **Metrics**: Cache hit rate monitoring

## Quick Start

```bash
# Install
pnpm add @spark-view/ssr-server

# Create DSL directory
mkdir dsls
echo "dslVersion: '1.0'\npage:\n  id: home\n  title: 'Home'\n  layout:\n    type: container" > dsls/home.yaml

# Start server
pnpm exec spark-ssr
```

## API

### GET /render/:dslId

Render DSL by ID.

```bash
curl http://localhost:3000/render/home
```

### POST /render

Render DSL from request body.

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"dsl": "dslVersion: \"1.0\"..."}'
```

### GET /health

Health check endpoint.

```bash
curl http://localhost:3000/health
# {"status":"ok","uptime":123.45}
```

## Configuration

Environment variables:

- `PORT`: Server port (default: 3000)
- `DSL_DIR`: DSL directory (default: ./dsls)

## Caching

### Memory Cache (default)

```typescript
import { createSSRServer, MemoryCache } from '@spark-view/ssr-server';

const server = createSSRServer({
  cache: new MemoryCache(),
});
```

### Redis Cache

```typescript
import { createSSRServer } from '@spark-view/ssr-server';
import Redis from 'ioredis';

class RedisCache {
  private client = new Redis(process.env.REDIS_URL);
  
  async get(key: string) {
    return await this.client.get(key);
  }
  
  async set(key: string, value: string, ttl?: number) {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }
}

const server = createSSRServer({
  cache: new RedisCache(),
});
```

## License

MIT
