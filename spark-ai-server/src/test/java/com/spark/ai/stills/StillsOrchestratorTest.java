package com.spark.ai.stills;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.stills.handler.ActionRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import com.spark.ai.stills.handler.FileWriteHandler;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Stills 编排器单元测试。
 */
class StillsOrchestratorTest {

    private StillsOrchestrator orchestrator;
    private ObjectMapper objectMapper;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        FileWriteHandler fileHandler = new FileWriteHandler(objectMapper, tempDir.toString());
        ActionRegistry registry = new ActionRegistry(List.of(fileHandler));
        orchestrator = new StillsOrchestrator(registry, objectMapper);
    }

    @Nested
    @DisplayName("协议格式校验")
    class ProtocolFormat {

        @Test
        @DisplayName("无效格式返回 FORMAT_ERROR")
        void shouldReturnFormatErrorForInvalidProtocol() {
            String result = orchestrator.processProtocol("这不是协议");

            assertTrue(result.contains("@@error:"));
            assertTrue(result.contains("FORMAT_ERROR"));
        }

        @Test
        @DisplayName("空白输入返回 FORMAT_ERROR")
        void shouldReturnFormatErrorForBlank() {
            String result = orchestrator.processProtocol("  ");

            assertTrue(result.contains("FORMAT_ERROR"));
        }
    }

    @Nested
    @DisplayName("动作路由")
    class ActionRouting {

        @Test
        @DisplayName("未知 action 返回 UNKNOWN_ACTION")
        void shouldReturnUnknownActionError() {
            String input = "@@request:email.send#r1\n{\"to\":\"a@b.com\"}\n@@end";

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("UNKNOWN_ACTION"));
            assertTrue(result.contains("email.send"));
        }

        @Test
        @DisplayName("system.capabilities 返回已注册 action 列表")
        void shouldReturnCapabilities() {
            String input = "@@describe:system.capabilities#cap1\n{}\n@@end";

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("@@result:system.capabilities#cap1"));
            assertTrue(result.contains("file.write"));
        }

        @Test
        @DisplayName("非法 type 返回 INVALID_TYPE")
        void shouldRejectInvalidType() {
            String input = "@@invalid:file.write#bad1\n{\"path\":\"ok.txt\",\"content\":\"data\"}\n@@end";

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("INVALID_TYPE"));
            assertTrue(result.contains("@@error:file.write#bad1"));
        }

        @Test
        @DisplayName("多个协议块返回 INVALID_PROTOCOL")
        void shouldRejectMultipleBlocks() {
            String input = "@@request:file.write#r1\n{\"path\":\"a.txt\",\"content\":\"A\"}\n@@end\n@@describe:system.capabilities#cap1\n{}\n@@end";

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("INVALID_PROTOCOL"));
            assertTrue(result.contains("一次只允许一个 Stills 协议块"));
        }

        @Test
        @DisplayName("describe 非 system.capabilities 返回 INVALID_PROTOCOL")
        void shouldRejectDescribeForRealAction() {
            String input = "@@describe:file.write#desc1\n{\"path\":\"ok.txt\"}\n@@end";

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("INVALID_PROTOCOL"));
            assertTrue(result.contains("describe 类型仅允许用于 system.capabilities"));
        }

        @Test
        @DisplayName("request system.capabilities 返回 INVALID_PROTOCOL")
        void shouldRejectRequestForCapabilities() {
            String input = "@@request:system.capabilities#cap2\n{}\n@@end";

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("INVALID_PROTOCOL"));
            assertTrue(result.contains("system.capabilities 必须使用 describe 类型"));
        }
    }

    @Nested
    @DisplayName("file.write 执行")
    class FileWriteExecution {

        @Test
        @DisplayName("正常写入成功")
        void shouldWriteFileSuccessfully() {
            String input = """
                    @@request:file.write#fw1
                    {"path":"output/test.txt","content":"Hello World"}
                    @@end
                    """;

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("@@result:file.write#fw1"));
            assertTrue(result.contains("success"));
            assertTrue(tempDir.resolve("output/test.txt").toFile().exists());
        }

        @Test
        @DisplayName("缺少 path 返回 INVALID_PARAMS")
        void shouldRejectMissingPath() {
            String input = """
                    @@request:file.write#fw2
                    {"content":"Hello"}
                    @@end
                    """;

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("INVALID_PARAMS"));
            assertTrue(result.contains("path"));
        }

        @Test
        @DisplayName("目录穿越返回 INVALID_PARAMS")
        void shouldRejectDirectoryTraversal() {
            String input = """
                    @@request:file.write#fw3
                    {"path":"../../etc/passwd","content":"hack"}
                    @@end
                    """;

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("INVALID_PARAMS"));
        }

        @Test
        @DisplayName("绝对路径返回 INVALID_PARAMS")
        void shouldRejectAbsolutePath() {
            String input = """
                    @@request:file.write#fw4
                    {"path":"/tmp/evil.txt","content":"hack"}
                    @@end
                    """;

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("INVALID_PARAMS"));
        }

        @Test
        @DisplayName("不允许的扩展名返回 INVALID_PARAMS")
        void shouldRejectDisallowedExtension() {
            String input = """
                    @@request:file.write#fw5
                    {"path":"script.exe","content":"binary"}
                    @@end
                    """;

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("INVALID_PARAMS"));
            assertTrue(result.contains("扩展名"));
        }

        @Test
        @DisplayName("返回的 id 正确关联请求")
        void shouldReturnCorrectId() {
            String input = """
                    @@request:file.write#my-unique-id-123
                    {"path":"ok.txt","content":"data"}
                    @@end
                    """;

            String result = orchestrator.processProtocol(input);

            assertTrue(result.contains("#my-unique-id-123"));
        }
    }
}
