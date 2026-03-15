package com.spark.ai.sap;

import com.spark.ai.sap.model.SapProtocolBlock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SAP 协议解析器单元测试。
 */
class SapProtocolParserTest {

    @Nested
    @DisplayName("parseFirst")
    class ParseFirst {

        @Test
        @DisplayName("解析标准 file.write 协议块")
        void shouldParseFileWriteBlock() {
            String input = """
                    @@request:file.write#req001
                    {"path":"hello.txt","content":"Hello SAP"}
                    @@end
                    """;

            SapProtocolBlock block = SapProtocolParser.parseFirst(input);

            assertNotNull(block);
            assertEquals("request", block.getType());
            assertEquals("file.write", block.getAction());
            assertEquals("req001", block.getId());
            assertTrue(block.getBody().contains("hello.txt"));
        }

        @Test
        @DisplayName("解析 db.query 协议块")
        void shouldParseDbQueryBlock() {
            String input = """
                    @@request:db.query#q1
                    {"sql":"SELECT * FROM users","limit":5}
                    @@end
                    """;

            SapProtocolBlock block = SapProtocolParser.parseFirst(input);

            assertNotNull(block);
            assertEquals("db.query", block.getAction());
            assertEquals("q1", block.getId());
        }

        @Test
        @DisplayName("解析 describe 类型")
        void shouldParseDescribeType() {
            String input = "@@describe:system.capabilities#cap1\n{}\n@@end";

            SapProtocolBlock block = SapProtocolParser.parseFirst(input);

            assertNotNull(block);
            assertEquals("describe", block.getType());
            assertEquals("system.capabilities", block.getAction());
        }

        @Test
        @DisplayName("null 输入返回 null")
        void shouldReturnNullForNullInput() {
            assertNull(SapProtocolParser.parseFirst(null));
        }

        @Test
        @DisplayName("空白输入返回 null")
        void shouldReturnNullForBlankInput() {
            assertNull(SapProtocolParser.parseFirst("   "));
        }

        @Test
        @DisplayName("无 @@end 标记返回 null")
        void shouldReturnNullWhenNoEndMarker() {
            String input = "@@request:file.write#r1\n{\"path\":\"a.txt\"}";
            assertNull(SapProtocolParser.parseFirst(input));
        }

        @Test
        @DisplayName("非协议文本返回 null")
        void shouldReturnNullForPlainText() {
            assertNull(SapProtocolParser.parseFirst("这只是普通文本"));
        }

        @Test
        @DisplayName("ID 支持横线")
        void shouldSupportHyphenInId() {
            String input = "@@request:file.write#req-001-abc\n{}\n@@end";
            SapProtocolBlock block = SapProtocolParser.parseFirst(input);
            assertNotNull(block);
            assertEquals("req-001-abc", block.getId());
        }
    }

    @Nested
    @DisplayName("parseAll")
    class ParseAll {

        @Test
        @DisplayName("解析多个协议块")
        void shouldParseMultipleBlocks() {
            String input = """
                    @@request:file.write#r1
                    {"path":"a.txt","content":"A"}
                    @@end
                    Some text between blocks.
                    @@request:db.query#r2
                    {"sql":"SELECT 1"}
                    @@end
                    """;

            List<SapProtocolBlock> blocks = SapProtocolParser.parseAll(input);

            assertEquals(2, blocks.size());
            assertEquals("file.write", blocks.get(0).getAction());
            assertEquals("db.query", blocks.get(1).getAction());
        }

        @Test
        @DisplayName("空输入返回空列表")
        void shouldReturnEmptyListForEmptyInput() {
            assertTrue(SapProtocolParser.parseAll("").isEmpty());
        }
    }
}
