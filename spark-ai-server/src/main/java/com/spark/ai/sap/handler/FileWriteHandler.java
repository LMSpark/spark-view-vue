package com.spark.ai.sap.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.sap.model.SapResult;
import jakarta.validation.constraints.NotBlank;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * file.write 动作处理器 — 安全文件写入。
 *
 * <h3>安全措施</h3>
 * <ul>
 *   <li>路径白名单：只允许写入配置的 sandbox 目录</li>
 *   <li>目录穿越检测：规范化后必须在 sandbox 内</li>
 *   <li>禁止绝对路径：path 必须是相对路径</li>
 *   <li>禁止特殊路径段：不允许 ".."</li>
 * </ul>
 */
@Component
public class FileWriteHandler implements ActionHandler {

    private static final Logger log = LoggerFactory.getLogger(FileWriteHandler.class);
    private static final String EXPECTED_FORMAT =
            "{\"path\":\"string (必填, 相对路径)\", \"content\":\"string (必填)\", \"append\": false}";

    /** 允许文件写入的扩展名白名单 */
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            ".txt", ".json", ".csv", ".md", ".xml", ".yml", ".yaml", ".log", ".html", ".css"
    );

    private final ObjectMapper objectMapper;
    private final Path sandboxRoot;

    public FileWriteHandler(ObjectMapper objectMapper,
                            @Value("${spark.sap.file-sandbox:./data/sap-sandbox}") String sandboxDir) {
        this.objectMapper = objectMapper;
        this.sandboxRoot = Path.of(sandboxDir).toAbsolutePath().normalize();
        log.info("[SAP] FileWriteHandler sandbox: {}", sandboxRoot);
    }

    @Override
    public String getAction() {
        return "file.write";
    }

    @Override
    public SapResult execute(String requestId, String jsonBody)
            throws ActionValidationException, ActionExecutionException {

        // 1. 反序列化参数
        FileWriteParams params;
        try {
            params = objectMapper.readValue(jsonBody, FileWriteParams.class);
        } catch (Exception e) {
            throw new ActionValidationException(
                    "JSON 解析失败: " + e.getMessage(),
                    "请严格按照此格式重发",
                    EXPECTED_FORMAT);
        }

        // 2. 必填字段校验
        if (params.path == null || params.path.isBlank()) {
            throw new ActionValidationException(
                    "缺失必填参数: path",
                    "请补充 path 字段后重发",
                    EXPECTED_FORMAT);
        }
        if (params.content == null) {
            throw new ActionValidationException(
                    "缺失必填参数: content",
                    "请补充 content 字段后重发",
                    EXPECTED_FORMAT);
        }

        // 3. 安全校验 — 防止目录穿越与非法路径
        validatePath(params.path);

        // 4. 解析目标路径
        Path targetPath = sandboxRoot.resolve(params.path).normalize();

        // 5. 路径必须在 sandbox 内（防穿越最终防线）
        if (!targetPath.startsWith(sandboxRoot)) {
            throw new ActionValidationException(
                    "路径越界: 写入目标不在 sandbox 目录内",
                    "path 必须是 sandbox 内的相对路径，不要包含 '..'",
                    EXPECTED_FORMAT);
        }

        // 6. 扩展名白名单
        String fileName = targetPath.getFileName().toString();
        String ext = fileName.contains(".") ? fileName.substring(fileName.lastIndexOf('.')) : "";
        if (!ALLOWED_EXTENSIONS.contains(ext.toLowerCase())) {
            throw new ActionValidationException(
                    "不允许的文件扩展名: " + ext,
                    "允许的扩展名: " + ALLOWED_EXTENSIONS,
                    EXPECTED_FORMAT);
        }

        // 7. 执行写入
        try {
            Files.createDirectories(targetPath.getParent());
            if (params.append) {
                Files.writeString(targetPath, params.content, StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            } else {
                Files.writeString(targetPath, params.content, StandardCharsets.UTF_8);
            }
            log.info("[SAP] 文件已写入: {} ({} bytes, append={})",
                    targetPath, params.content.length(), params.append);
        } catch (IOException e) {
            throw new ActionExecutionException("文件写入失败: " + e.getMessage(), e);
        }

        // 8. 构造成功响应
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "success");
        data.put("path", params.path);
        data.put("size", params.content.length());
        data.put("append", params.append);
        return new SapResult("file.write", requestId, data);
    }

    private void validatePath(String path) throws ActionValidationException {
        // 禁止绝对路径
        if (path.startsWith("/") || path.startsWith("\\") || path.matches("^[A-Za-z]:.*")) {
            throw new ActionValidationException(
                    "不允许绝对路径: " + path,
                    "请使用相对路径（如 'output/hello.txt'）",
                    EXPECTED_FORMAT);
        }

        // 禁止 .. 目录穿越
        if (path.contains("..")) {
            throw new ActionValidationException(
                    "路径包含非法目录穿越: " + path,
                    "禁止在路径中使用 '..'",
                    EXPECTED_FORMAT);
        }

        // 禁止空字节（null byte injection）
        if (path.indexOf('\0') >= 0) {
            throw new ActionValidationException(
                    "路径包含非法字符",
                    "请确保路径不包含特殊控制字符",
                    EXPECTED_FORMAT);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 参数 POJO
    // ─────────────────────────────────────────────────────────────────────────

    static class FileWriteParams {
        @NotBlank
        public String path;

        @NotBlank
        public String content;

        public boolean append = false;
    }
}
