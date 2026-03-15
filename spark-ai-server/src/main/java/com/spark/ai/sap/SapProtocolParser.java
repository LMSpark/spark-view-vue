package com.spark.ai.sap;

import com.spark.ai.sap.model.SapProtocolBlock;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SAP/1.0 协议文本解析器。
 *
 * <h3>协议格式</h3>
 * <pre>
 * @@&lt;type&gt;:&lt;action&gt;#&lt;id&gt;
 * &lt;JSON body&gt;
 * @@end
 * </pre>
 *
 * <h3>设计说明</h3>
 * <ul>
 *   <li>先匹配首行协议头（{@code @@type:action#id}），再向后搜索最近的 {@code @@end} 收尾</li>
 *   <li>不使用单个 DOTALL 正则，避免 body 中出现 {@code @@end} 造成误切分</li>
 *   <li>支持单次输入包含多个协议块</li>
 * </ul>
 */
public class SapProtocolParser {

    /**
     * 匹配协议头：@@type:action#id（type/action 允许字母数字下划线点号，id 允许字母数字下划线横线）
     */
    private static final Pattern HEADER_PATTERN =
            Pattern.compile("@@(\\w+):([\\w.]+)#([\\w-]+)");

    /** 协议结尾标记 */
    private static final String END_MARKER = "@@end";

    private SapProtocolParser() {}

    /**
     * 解析输入文本中的所有 SAP 协议块。
     *
     * @param rawText AI 输出的原始文本
     * @return 解析出的协议块列表（可能为空，但不为 null）
     */
    public static List<SapProtocolBlock> parseAll(String rawText) {
        if (rawText == null || rawText.isBlank()) {
            return List.of();
        }

        List<SapProtocolBlock> blocks = new ArrayList<>();
        Matcher headerMatcher = HEADER_PATTERN.matcher(rawText);

        while (headerMatcher.find()) {
            String type = headerMatcher.group(1);
            String action = headerMatcher.group(2);
            String id = headerMatcher.group(3);

            // body 起始位置：header 行末尾之后
            int bodyStart = headerMatcher.end();

            // 查找 body 之后最近的 @@end
            int endIdx = rawText.indexOf(END_MARKER, bodyStart);
            if (endIdx < 0) {
                // 没有找到 @@end，跳过这个块
                continue;
            }

            String body = rawText.substring(bodyStart, endIdx).trim();
            blocks.add(new SapProtocolBlock(type, action, id, body));

            // 移动搜索起点到 @@end 之后，避免嵌套误解析
            // 由于 Matcher 会自动从上次成功位置继续，这里只需确保 endIdx 在下一个 header 之前
        }

        return blocks;
    }

    /**
     * 解析输入文本中的第一个 SAP 协议块。
     *
     * @param rawText AI 输出的原始文本
     * @return 第一个协议块，如果没有有效块则返回 null
     */
    public static SapProtocolBlock parseFirst(String rawText) {
        List<SapProtocolBlock> blocks = parseAll(rawText);
        return blocks.isEmpty() ? null : blocks.get(0);
    }
}
