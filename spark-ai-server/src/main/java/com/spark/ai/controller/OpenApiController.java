package com.spark.ai.controller;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/**
 * Lightweight OpenAPI/Swagger endpoints without adding springdoc dependencies.
 */
@RestController
public class OpenApiController {

    private static final String OPENAPI_RESOURCE = "openapi/dynamic-data-openapi.json";

    @GetMapping(value = "/api/openapi.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> openApiJson() throws IOException {
        ClassPathResource resource = new ClassPathResource(OPENAPI_RESOURCE);
        String json = StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(json);
    }

    @GetMapping("/api/swagger")
    public ResponseEntity<Void> swaggerRedirect() {
        return ResponseEntity.status(302)
                .location(URI.create("/api/swagger-ui"))
                .build();
    }

    @GetMapping(value = "/api/swagger-ui", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> swaggerUi() {
        String html = """
            <!doctype html>
            <html lang="zh-CN">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>SPARK Dynamic Data API</title>
              <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
              <style>
                body { margin: 0; background: #f7f7f8; }
                .topbar { display: none; }
              </style>
            </head>
            <body>
              <div id="swagger-ui"></div>
              <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
              <script>
                window.ui = SwaggerUIBundle({
                  url: '/api/openapi.json',
                  dom_id: '#swagger-ui',
                  deepLinking: true,
                  persistAuthorization: true
                });
              </script>
            </body>
            </html>
            """;
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(MediaType.TEXT_HTML)
                .body(html);
    }
}
