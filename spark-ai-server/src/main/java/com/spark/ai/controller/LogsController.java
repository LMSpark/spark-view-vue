package com.spark.ai.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 前端远程日志接收端点。
 *
 * 开发环境下 Vite 会把 /api/* 代理到 Java 后端；
 * 这里最小接收前端批量日志，避免启动期持续 404。
 */
@RestController
public class LogsController {

    private static final Logger log = LoggerFactory.getLogger(LogsController.class);

    @SuppressWarnings("unchecked")
    @PostMapping("/api/logs")
    public ResponseEntity<Map<String, Object>> ingestLogs(@RequestBody(required = false) Map<String, Object> body) {
        Object logsValue = body != null ? body.get("logs") : null;
        int count = logsValue instanceof List<?> logs ? logs.size() : 0;

        if (count > 0 && log.isDebugEnabled()) {
            Object first = ((List<Object>) logsValue).get(0);
            log.debug("[RemoteLogs] received {} log entries, first={}", count, first);
        }

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "received", count
        ));
    }
}