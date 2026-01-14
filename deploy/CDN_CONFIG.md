# 云服务CDN优化配置示例

## 阿里云CDN配置
```json
{
  "cache_rules": [
    {
      "rule_name": "JS/CSS永久缓存",
      "path_pattern": "*.js,*.css",
      "cache_time": "31536000",
      "ignore_case": true
    },
    {
      "rule_name": "图片缓存",
      "path_pattern": "*.png,*.jpg,*.jpeg,*.gif,*.svg,*.ico",
      "cache_time": "2592000"
    },
    {
      "rule_name": "HTML短缓存",
      "path_pattern": "*.html",
      "cache_time": "300"
    }
  ],
  "compression": {
    "gzip": true,
    "brotli": true
  }
}
```

## 腾讯云CDN配置
```json
{
  "cacheKey": {
    "includeQueryString": {
      "switch": "off"
    }
  },
  "cache": [
    {
      "simpleCache": {
        "cacheRules": [
          {
            "cacheType": "file",
            "cacheContents": ["js", "css"],
            "cacheTime": 31536000
          },
          {
            "cacheType": "file", 
            "cacheContents": ["html"],
            "cacheTime": 300
          }
        ]
      }
    }
  ]
}
```

## Vercel配置 (vercel.json)
```json
{
  "headers": [
    {
      "source": "/(.*\\.(?:js|css))",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/(.*\\.(?:png|jpg|jpeg|gif|svg|ico))",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=2592000"
        }
      ]
    }
  ]
}
```