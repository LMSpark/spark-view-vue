package com.spark.ai.crud;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * FilterExpression -> SQL 片段编译器。
 *
 * <p>后端语义与前端不同：前端在当前行上下文中做值替换，本类在服务端将 AST 编译为 SQL 条件，
 * 结构化字段引用 { kind: "field", field: "..." } 会编译成列/表达式引用，而不是先查出行再替换值。
 */
public final class FilterExpressionSqlBuilder {

    private final Map<String, String> fieldSqlMap;

    public FilterExpressionSqlBuilder(Map<String, String> fieldSqlMap) {
        this.fieldSqlMap = Map.copyOf(fieldSqlMap);
    }

    public SqlFragment buildWhere(Object expression) {
        if (expression == null) {
            return SqlFragment.empty();
        }
        if (!(expression instanceof Map<?, ?> expr)) {
            throw new IllegalArgumentException("filter 必须是对象");
        }
        return compileExpression(expr);
    }

    public String buildOrderBy(String sortExpression, String fallbackExpression) {
        if (sortExpression == null || sortExpression.isBlank()) {
            return " ORDER BY " + fallbackExpression;
        }

        List<String> clauses = new ArrayList<>();
        for (String rawClause : sortExpression.split(",")) {
            String clause = rawClause.trim();
            if (clause.isEmpty()) {
                continue;
            }

            String[] parts = clause.split(":", 2);
            String field = parts[0].trim();
            if (field.isEmpty()) {
                throw new IllegalArgumentException("排序字段不能为空");
            }
            String direction = parts.length > 1 ? parts[1].trim().toLowerCase() : "asc";
            if (!"asc".equals(direction) && !"desc".equals(direction)) {
                throw new IllegalArgumentException("非法排序方向: " + direction);
            }

            clauses.add(resolveField(field, "排序字段不存在: %s") + " " + direction.toUpperCase());
        }

        if (clauses.isEmpty()) {
            return " ORDER BY " + fallbackExpression;
        }
        clauses.add(fallbackExpression + " ASC");
        return " ORDER BY " + String.join(", ", clauses);
    }

    private SqlFragment compileExpression(Map<?, ?> expr) {
        Object typeValue = expr.get("type");
        if (typeValue instanceof String type) {
            return switch (type) {
                case "!condition" -> negate(compileCondition(expr));
                case "and" -> compileLogical(readChildren(expr), "AND", true);
                case "or" -> compileLogical(readChildren(expr), "OR", false);
                case "!and" -> negate(compileLogical(readChildren(expr), "AND", true));
                case "!or" -> negate(compileLogical(readChildren(expr), "OR", false));
                default -> throw new IllegalArgumentException("未知过滤表达式节点: " + type);
            };
        }

        if (expr.containsKey("field") && expr.containsKey("op")) {
            return compileCondition(expr);
        }

        throw new IllegalArgumentException("非法过滤表达式节点");
    }

    private SqlFragment compileLogical(List<Map<?, ?>> children, String joiner, boolean emptyValue) {
        if (children.isEmpty()) {
            return SqlFragment.of(emptyValue ? "1 = 1" : "1 = 0");
        }

        List<String> parts = new ArrayList<>();
        List<Object> parameters = new ArrayList<>();
        for (Map<?, ?> child : children) {
            SqlFragment fragment = compileExpression(child);
            parts.add("(" + fragment.sql() + ")");
            parameters.addAll(fragment.parameters());
        }
        return new SqlFragment(String.join(" " + joiner + " ", parts), parameters);
    }

    private SqlFragment negate(SqlFragment fragment) {
        return new SqlFragment("NOT (" + fragment.sql() + ")", fragment.parameters());
    }

    private SqlFragment compileCondition(Map<?, ?> expr) {
        String field = readRequiredString(expr, "field", "过滤条件字段不能为空");
        String op = readRequiredString(expr, "op", "过滤条件操作符不能为空");
        String leftSql = resolveField(field, "过滤条件引用了不存在的字段 \"%s\"");

        return switch (op) {
            case "==" -> compileBinary(leftSql, expr.get("value"), " IS NOT DISTINCT FROM ");
            case "!=" -> compileBinary(leftSql, expr.get("value"), " IS DISTINCT FROM ");
            case ">" -> compileBinary(leftSql, expr.get("value"), " > ");
            case ">=" -> compileBinary(leftSql, expr.get("value"), " >= ");
            case "<" -> compileBinary(leftSql, expr.get("value"), " < ");
            case "<=" -> compileBinary(leftSql, expr.get("value"), " <= ");
            case "in" -> compileIn(leftSql, expr.get("value"), false);
            case "not in" -> compileIn(leftSql, expr.get("value"), true);
            case "like", "contains" -> compileContains(leftSql, expr.get("value"), false);
            case "not like" -> compileContains(leftSql, expr.get("value"), true);
            case "startsWith" -> compilePrefix(leftSql, expr.get("value"), false);
            case "endsWith" -> compileSuffix(leftSql, expr.get("value"), false);
            case "is null" -> SqlFragment.of(leftSql + " IS NULL");
            case "is not null" -> SqlFragment.of(leftSql + " IS NOT NULL");
            case "between" -> compileBetween(leftSql, expr.get("value"), false);
            case "not between" -> compileBetween(leftSql, expr.get("value"), true);
            default -> throw new IllegalArgumentException("未知过滤操作符: " + op);
        };
    }

    private SqlFragment compileBinary(String leftSql, Object value, String operator) {
        CompiledValueExpression compiledValue = compileScalarValue(value);
        return new SqlFragment(leftSql + operator + compiledValue.sql(), compiledValue.parameters());
    }

    private SqlFragment compileIn(String leftSql, Object value, boolean negated) {
        List<CompiledValueExpression> values = compileValueList(value, negated ? "not in" : "in");
        List<String> sqlParts = new ArrayList<>();
        List<Object> parameters = new ArrayList<>();
        for (CompiledValueExpression item : values) {
            sqlParts.add(item.sql());
            parameters.addAll(item.parameters());
        }
        return new SqlFragment(
                leftSql + (negated ? " NOT IN (" : " IN (") + String.join(", ", sqlParts) + ")",
                parameters
        );
    }

    private SqlFragment compileBetween(String leftSql, Object value, boolean negated) {
        List<CompiledValueExpression> values = compileValueList(value, negated ? "not between" : "between");
        if (values.size() < 2) {
            throw new IllegalArgumentException((negated ? "not between" : "between") + " 至少需要两个值");
        }

        List<Object> parameters = new ArrayList<>();
        parameters.addAll(values.get(0).parameters());
        parameters.addAll(values.get(1).parameters());
        return new SqlFragment(
                leftSql + (negated ? " NOT BETWEEN " : " BETWEEN ") + values.get(0).sql() + " AND " + values.get(1).sql(),
                parameters
        );
    }

    private SqlFragment compileContains(String leftSql, Object value, boolean negated) {
        CompiledValueExpression compiledValue = compileScalarValue(value);
        String castLeft = "CAST(" + leftSql + " AS VARCHAR)";
        String patternSql;
        if (compiledValue.isFieldReference()) {
            patternSql = "('%' || CAST(" + compiledValue.sql() + " AS VARCHAR) || '%')";
        } else {
            patternSql = "?";
        }

        List<Object> parameters = new ArrayList<>();
        if (compiledValue.isFieldReference()) {
            parameters.addAll(compiledValue.parameters());
        } else {
            parameters.add("%" + String.valueOf(compiledValue.literalValue() == null ? "" : compiledValue.literalValue()) + "%");
        }

        return new SqlFragment(
                castLeft + (negated ? " NOT LIKE " : " LIKE ") + patternSql,
                parameters
        );
    }

    private SqlFragment compilePrefix(String leftSql, Object value, boolean negated) {
        CompiledValueExpression compiledValue = compileScalarValue(value);
        String castLeft = "CAST(" + leftSql + " AS VARCHAR)";
        String patternSql;
        List<Object> parameters = new ArrayList<>();
        if (compiledValue.isFieldReference()) {
            patternSql = "(CAST(" + compiledValue.sql() + " AS VARCHAR) || '%')";
            parameters.addAll(compiledValue.parameters());
        } else {
            patternSql = "?";
            parameters.add(String.valueOf(compiledValue.literalValue() == null ? "" : compiledValue.literalValue()) + "%");
        }

        return new SqlFragment(castLeft + (negated ? " NOT LIKE " : " LIKE ") + patternSql, parameters);
    }

    private SqlFragment compileSuffix(String leftSql, Object value, boolean negated) {
        CompiledValueExpression compiledValue = compileScalarValue(value);
        String castLeft = "CAST(" + leftSql + " AS VARCHAR)";
        String patternSql;
        List<Object> parameters = new ArrayList<>();
        if (compiledValue.isFieldReference()) {
            patternSql = "('%' || CAST(" + compiledValue.sql() + " AS VARCHAR))";
            parameters.addAll(compiledValue.parameters());
        } else {
            patternSql = "?";
            parameters.add("%" + String.valueOf(compiledValue.literalValue() == null ? "" : compiledValue.literalValue()));
        }

        return new SqlFragment(castLeft + (negated ? " NOT LIKE " : " LIKE ") + patternSql, parameters);
    }

    private CompiledValueExpression compileScalarValue(Object value) {
        if (value == null || value instanceof Number || value instanceof Boolean) {
            return CompiledValueExpression.literal("?", List.of(value), value);
        }
        if (value instanceof String stringValue) {
            assertNoLegacyPlaceholder(stringValue);
            return CompiledValueExpression.literal("?", List.of(stringValue), stringValue);
        }
        if (value instanceof Map<?, ?> mapValue) {
            Object kind = mapValue.get("kind");
            Object field = mapValue.get("field");
            if (!"field".equals(kind) || !(field instanceof String fieldName) || fieldName.isBlank()) {
                throw new IllegalArgumentException("非法过滤值表达式");
            }
            return CompiledValueExpression.fieldReference(
                    resolveField(fieldName, "过滤值表达式引用了不存在的字段 \"%s\"")
            );
        }
        throw new IllegalArgumentException("非法过滤值表达式");
    }

    private List<CompiledValueExpression> compileValueList(Object value, String operator) {
        if (!(value instanceof List<?> listValue)) {
            throw new IllegalArgumentException(operator + " 的 value 必须是数组");
        }
        if (listValue.isEmpty()) {
            throw new IllegalArgumentException(operator + " 的 value 不能为空数组");
        }

        List<CompiledValueExpression> result = new ArrayList<>(listValue.size());
        for (Object item : listValue) {
            result.add(compileScalarValue(item));
        }
        return result;
    }

    private List<Map<?, ?>> readChildren(Map<?, ?> expr) {
        Object children = expr.get("children");
        if (!(children instanceof List<?> listValue)) {
            throw new IllegalArgumentException("过滤表达式 children 必须是数组");
        }

        List<Map<?, ?>> result = new ArrayList<>(listValue.size());
        for (Object child : listValue) {
            if (!(child instanceof Map<?, ?> childMap)) {
                throw new IllegalArgumentException("过滤表达式子节点必须是对象");
            }
            result.add(childMap);
        }
        return result;
    }

    private String readRequiredString(Map<?, ?> source, String key, String errorMessage) {
        Object value = source.get(key);
        if (!(value instanceof String stringValue) || stringValue.isBlank()) {
            throw new IllegalArgumentException(errorMessage);
        }
        return stringValue.trim();
    }

    private String resolveField(String fieldName, String errorTemplate) {
        String resolved = fieldSqlMap.get(fieldName);
        if (resolved == null) {
            throw new IllegalArgumentException(String.format(errorTemplate, fieldName));
        }
        return resolved;
    }

    private void assertNoLegacyPlaceholder(String value) {
        if (value.contains("$parent[") || value.contains("\\$parent[")) {
            throw new IllegalArgumentException("过滤值中的 $parent[...] 协议已移除，请改用 parentField / childField 关系绑定");
        }
        if (value.contains("$[") || value.contains("\\$[")) {
            throw new IllegalArgumentException("过滤值占位字符串协议已移除，请改用结构化字段引用 { kind: \"field\", field: \"...\" }");
        }
    }

    public record SqlFragment(String sql, List<Object> parameters) {
        public static SqlFragment empty() {
            return new SqlFragment("", List.of());
        }

        public static SqlFragment of(String sql) {
            return new SqlFragment(sql, List.of());
        }
    }

    private record CompiledValueExpression(String sql, List<Object> parameters, boolean isFieldReference, Object literalValue) {
        private static CompiledValueExpression literal(String sql, List<Object> parameters, Object literalValue) {
            return new CompiledValueExpression(sql, parameters, false, literalValue);
        }

        private static CompiledValueExpression fieldReference(String sql) {
            return new CompiledValueExpression(sql, List.of(), true, null);
        }
    }
}