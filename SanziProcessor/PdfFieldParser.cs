using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

class PdfFieldParser
{
    static void Main(string[] args)
    {
        try
        {
            // 读取markdown文件
            string markdownPath = @"e:\spark-view\沙市区二轮延包基础数据\三资矢量数据格式要求20241210.md";
            string markdownContent = File.ReadAllText(markdownPath, Encoding.UTF8);

            // 解析字段数据
            var fieldData = ParseFieldData(markdownContent);

            // 自动填充缺失的英文字段名（保守策略）
            int beforeEngCount = fieldData.Count(f => !string.IsNullOrEmpty(f.EnglishFieldName));
            AutoFillMissingEnglishFromMarkdown(fieldData, markdownContent);
            int afterEngCount = fieldData.Count(f => !string.IsNullOrEmpty(f.EnglishFieldName));
            Console.WriteLine($"自动修复前英文字段数: {beforeEngCount}, 修复后: {afterEngCount} (新增 {afterEngCount - beforeEngCount})");

            // 保存为JSON
            string jsonPath = @"e:\spark-view\沙市区二轮延包基础数据\三资矢量数据格式要求20241210_fields.json";
            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };
            string jsonContent = JsonSerializer.Serialize(fieldData, options);
            File.WriteAllText(jsonPath, jsonContent, Encoding.UTF8);

            Console.WriteLine($"成功解析了 {fieldData.Count} 个字段");
            Console.WriteLine($"JSON文件已保存到: {jsonPath}");

        }
        catch (Exception ex)
        {
            Console.WriteLine($"处理过程中出现错误: {ex.Message}");
        }
    }

    static List<FieldInfo> ParseFieldData(string content)
    {
        var fields = new List<FieldInfo>();

        // 找到属性表格式开始位置
        int tableStart = content.IndexOf("（2）矢量图层属性表格式");
        if (tableStart < 0) return fields;

        // 找到表格开始
        int tableHeaderIndex = content.IndexOf("分类 图层名称 序号", tableStart);
        if (tableHeaderIndex < 0) return fields;

        // 提取表格内容
        string tableContent = content.Substring(tableHeaderIndex);

        // 解析表格数据（使用按行解析）
        ParseTableDataRowWise(tableContent, fields);

        return fields;
    }

    static void ParseTableData(string tableContent, List<FieldInfo> fields)
    {
        // 解析按列排列的表格数据
        var lines = tableContent.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                               .Select(line => line.Trim())
                               .Where(line => !string.IsNullOrWhiteSpace(line) && !line.Contains("—") && !line.Contains(""))
                               .ToList();

        string currentCategory = "";
        string currentLayerName = "";

        // 用于存储各列的数据
        var sequenceNumbers = new List<int>();
        var englishFieldNames = new List<string>();
        var chineseFieldNames = new List<string>();
        var descriptions = new List<string>();

        // 记录每个分类的列快照，用于后续生成对齐报告
        var snapshots = new List<(string Category, string Layer, List<int> Seq, List<string> Eng, List<string> Chi, List<string> Desc)>();

        // 明确的一些需要直接跳过的表头或层名词
        var skipExact = new HashSet<string> { "资源", "图斑", "宅基地", "分类 图层名称 序号", "字段英文名称", "字段中文名称", "说明", "序号", "分类", "图层名称" };

        foreach (var line in lines)
        {
            if (skipExact.Contains(line)) continue;

            // 检测分类开始
            if (line.Contains("资源含林业") || line.Contains("二轮土地承") ||
                line.Contains("三调地类图") || line.Contains("宅基地") ||
                line.Contains("资源性资产") || line.Contains("资产点状资产") ||
                line.Contains("标记建筑") || line.Contains("公共"))
            {
                // 如果有之前的数据，且有英文字段名则进行处理
                if (englishFieldNames.Count > 0)
                {
                    // 保存快照，便于后续生成校验报告
                    snapshots.Add((currentCategory, currentLayerName, new List<int>(sequenceNumbers), new List<string>(englishFieldNames), new List<string>(chineseFieldNames), new List<string>(descriptions)));
                    ProcessColumnData(fields, currentCategory, currentLayerName,
                                    sequenceNumbers, englishFieldNames, chineseFieldNames, descriptions);
                }

                sequenceNumbers.Clear();
                englishFieldNames.Clear();
                chineseFieldNames.Clear();
                descriptions.Clear();

                if (line.Contains("资源含林业"))
                {
                    currentCategory = "林业确权";
                    currentLayerName = "资源";
                }
                else if (line.Contains("二轮土地承"))
                {
                    currentCategory = "土地承包确权";
                    currentLayerName = "资源";
                }
                else if (line.Contains("三调地类图"))
                {
                    currentCategory = "三调地类";
                    currentLayerName = "图斑";
                }
                else if (line.Contains("宅基地"))
                {
                    currentCategory = "宅基地";
                    currentLayerName = "宅基地";
                }
                else if (line.Contains("资源性资产"))
                {
                    currentCategory = "资源性资产";
                    currentLayerName = "资产";
                }
                else if (line.Contains("资产点状资产"))
                {
                    currentCategory = "点状资产";
                    currentLayerName = "资产";
                }
                else if (line.Contains("标记建筑"))
                {
                    currentCategory = "标记建筑";
                    currentLayerName = "资产";
                }
                else if (line.Contains("公共"))
                {
                    currentCategory = "公共";
                    currentLayerName = "公共";
                }
                continue;
            }

            // 跳过常见表头和分隔符
            if (line.Contains("分类图层名称序号") || line.Contains("字段英文名称") ||
                line.Contains("字段中文名称") || line.Contains("说明") ||
                line.Contains("包确权") || line.Contains("确权") ||
                line.Contains("勘界") || line.Contains("水库") || line.Contains("河流") ||
                line.Contains("所有矢量图层均为 shp 格式"))
            {
                continue;
            }

            // 分类数据到对应列（以英文字段为主轴）
            if (!string.IsNullOrEmpty(currentCategory))
            {
                // 如果是纯数字则认为是序号
                if (int.TryParse(line, out int seq))
                {
                    sequenceNumbers.Add(seq);
                    continue;
                }

                // 如果是英文字段名
                if (IsEnglishFieldName(line))
                {
                    englishFieldNames.Add(line);
                    continue;
                }

                // 排除当前层名等干扰项
                if (line == currentLayerName) continue;

                // 如果是中文字段名（且不是说明）
                if (IsChineseFieldName(line) && !IsDescriptionLine(line))
                {
                    chineseFieldNames.Add(line);
                    continue;
                }

                // 其余包含中文的认为是说明
                if (IsDescriptionLine(line) || (!IsEnglishFieldName(line) && !IsChineseFieldName(line)))
                {
                    descriptions.Add(line);
                    continue;
                }
            }
        }
        // 处理最后一批数据（仅当识别到英文字段名时）
        if (englishFieldNames.Count > 0)
        {
            // 最后一批也保存快照
            snapshots.Add((currentCategory, currentLayerName, new List<int>(sequenceNumbers), new List<string>(englishFieldNames), new List<string>(chineseFieldNames), new List<string>(descriptions)));
            ProcessColumnData(fields, currentCategory, currentLayerName,
                            sequenceNumbers, englishFieldNames, chineseFieldNames, descriptions);
        }

        // 生成校验报告到同目录下的文本文件
        try
        {
            string reportDir = @"e:\\spark-view\\沙市区二轮延包基础数据";
            string reportPath = Path.Combine(reportDir, "三资字段对齐报告.txt");
            using (var sw = new StreamWriter(reportPath, false, Encoding.UTF8))
            {
                sw.WriteLine("三资字段对齐报告");
                sw.WriteLine("分类 | 图层 | 序号数 | 英文字段数 | 中文字段数 | 说明数 | 问题");
                sw.WriteLine("----|------|--------|----------|----------|------|------");
                foreach (var s in snapshots)
                {
                    int seqN = s.Seq.Count;
                    int engN = s.Eng.Count;
                    int chiN = s.Chi.Count;
                    int descN = s.Desc.Count;
                    string issue = (engN == chiN && engN > 0) ? "" : $"不匹配 (seq:{seqN}, eng:{engN}, chi:{chiN}, desc:{descN})";
                    sw.WriteLine($"{s.Category} | {s.Layer} | {seqN} | {engN} | {chiN} | {descN} | {issue}");
                    if (!string.IsNullOrEmpty(issue))
                    {
                        int max = Math.Max(Math.Max(seqN, engN), Math.Max(chiN, descN));
                        for (int i = 0; i < Math.Min(max, 10); i++)
                        {
                            string a = i < s.Seq.Count ? s.Seq[i].ToString() : "";
                            string b = i < s.Eng.Count ? s.Eng[i] : "";
                            string c = i < s.Chi.Count ? s.Chi[i] : "";
                            string d = i < s.Desc.Count ? s.Desc[i] : "";
                            sw.WriteLine($"  示例 {i+1}: 序号={a} 英文={b} 中文={c} 说明={d}");
                        }
                    }
                }
            }
            Console.WriteLine($"已生成对齐报告: {reportPath}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"写报告失败: {ex.Message}");
        }
    }

    static void ProcessColumnData(List<FieldInfo> fields, string category, string layerName,
                                List<int> sequenceNumbers, List<string> englishFieldNames,
                                List<string> chineseFieldNames, List<string> descriptions)
    {
        // 以英文字段为主轴对齐；在中文字段过多的情况下尝试用保守规则选择更可能的中文字段名
        List<string> chineseCandidates = new List<string>(chineseFieldNames);

        bool IsLikelyChineseFieldName(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return false;
            // 必须含有中文
            if (!s.Any(c => c >= 0x4E00 && c <= 0x9FFF)) return false;
            // 不应包含明显是说明的短语或数字或标点
            if (s.Contains("参照") || s.Contains("参考") || (s.Contains("位") && System.Text.RegularExpressions.Regex.IsMatch(s, "\\d"))) return false;
            if (s.Contains("与") && s.Contains("一致")) return false;
            if (s.Contains("唯一编码") || (s.Contains("编号") && s.Length > 12 && s.Contains("："))) return false;
            if (s.Contains("，") || s.Contains("；") || s.Contains("。")) return false;
            // 合理长度
            if (s.Length > 30) return false;
            return true;
        }

        var filteredChi = chineseCandidates.Where(IsLikelyChineseFieldName).ToList();
        // 当过滤后数量合理（>= 英文字段数或接近）时使用过滤后的，否则退回原始
        var useChi = (filteredChi.Count >= englishFieldNames.Count && filteredChi.Count > 0) ? filteredChi : chineseCandidates;

        int baseCount = englishFieldNames.Count > 0 ? englishFieldNames.Count : Math.Max(Math.Max(sequenceNumbers.Count, useChi.Count), descriptions.Count);

        // 若序号不足但有英文字段，则生成默认序号
        for (int i = 0; i < baseCount; i++)
        {
            var field = new FieldInfo
            {
                Category = category,
                LayerName = layerName,
                SequenceNumber = i < sequenceNumbers.Count ? sequenceNumbers[i] : (i + 1),
                EnglishFieldName = i < englishFieldNames.Count ? englishFieldNames[i] : "",
                ChineseFieldName = i < useChi.Count ? useChi[i] : "",
                Description = i < descriptions.Count ? descriptions[i] : ""
            };
            fields.Add(field);
        }
    }

    // 新的按行解析方法，逐行处理序号 英文 中文 说明
    static void ParseTableDataRowWise(string tableContent, List<FieldInfo> fields)
    {
        var lines = tableContent.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                               .Select(line => line.Trim())
                               .Where(line => !string.IsNullOrWhiteSpace(line) && !line.Contains("—") && !line.Contains("\f"))
                               .ToList();

        string currentCategory = "";
        string currentLayerName = "";
        var skipExact = new HashSet<string> { "资源", "图斑", "宅基地", "分类 图层名称 序号", "字段英文名称", "字段中文名称", "说明", "序号", "分类", "图层名称" };

        // 按分类分块
        var blocks = new List<(string Category, string Layer, List<string> Lines)>();
        var curBlockLines = new List<string>();
        for (int i = 0; i < lines.Count; i++)
        {
            var line = lines[i];
            if (skipExact.Contains(line)) continue;

            if (line.Contains("资源含林业") || line.Contains("二轮土地承") || line.Contains("三调地类图") || line.Contains("宅基地") ||
                line.Contains("资源性资产") || line.Contains("资产点状资产") || line.Contains("标记建筑") || line.Contains("公共"))
            {
                // flush previous block
                if (curBlockLines.Count > 0)
                {
                    blocks.Add((currentCategory, currentLayerName, new List<string>(curBlockLines)));
                    curBlockLines.Clear();
                }

                if (line.Contains("资源含林业")) { currentCategory = "林业确权"; currentLayerName = "资源"; }
                else if (line.Contains("二轮土地承")) { currentCategory = "土地承包确权"; currentLayerName = "资源"; }
                else if (line.Contains("三调地类图")) { currentCategory = "三调地类"; currentLayerName = "图斑"; }
                else if (line.Contains("宅基地")) { currentCategory = "宅基地"; currentLayerName = "宅基地"; }
                else if (line.Contains("资源性资产")) { currentCategory = "资源性资产"; currentLayerName = "资产"; }
                else if (line.Contains("资产点状资产")) { currentCategory = "点状资产"; currentLayerName = "资产"; }
                else if (line.Contains("标记建筑")) { currentCategory = "标记建筑"; currentLayerName = "资产"; }
                else if (line.Contains("公共")) { currentCategory = "公共"; currentLayerName = "公共"; }

                continue;
            }

            if (line.Contains("分类图层名称序号") || line.Contains("字段英文名称") || line.Contains("字段中文名称") || line.Contains("说明") ||
                line.Contains("包确权") || line.Contains("确权") || line.Contains("勘界") || line.Contains("水库") || line.Contains("河流") ||
                line.Contains("所有矢量图层均为 shp 格式")) continue;

            curBlockLines.Add(line);
        }
        if (curBlockLines.Count > 0) blocks.Add((currentCategory, currentLayerName, new List<string>(curBlockLines)));

        // 处理每个块：严格按“序号对应一条记录”的规则解析
        foreach (var block in blocks)
        {
            StrictParseBlock(block, fields);
        }

    // 严格解析：每个序号对应一条记录。按空格划分 token，并在 token 流中识别序号、英文字段、中文字段与说明。
    static void StrictParseBlock((string Category, string Layer, List<string> Lines) block, List<FieldInfo> fields)
    {
        var tokens = new List<string>();
        foreach (var line in block.Lines)
        {
            var parts = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            tokens.AddRange(parts);
        }

        int i = 0;
        while (i < tokens.Count)
        {
            var tok = tokens[i];
            if (int.TryParse(tok, out int seq))
            {
                string eng = "";
                string chi = "";
                var descParts = new List<string>();
                int j = i + 1;
                while (j < tokens.Count)
                {
                    var t = tokens[j];
                    if (int.TryParse(t, out _)) break; // 下一条记录开始

                    if (string.IsNullOrEmpty(eng) && IsEnglishFieldName(t))
                    {
                        eng = t;
                    }
                    else if (string.IsNullOrEmpty(chi) && IsChineseFieldName(t))
                    {
                        chi = string.IsNullOrEmpty(chi) ? t : (chi + " " + t);
                    }
                    else
                    {
                        descParts.Add(t);
                    }
                    j++;
                }
                var desc = descParts.Count > 0 ? string.Join(" ", descParts) : "";
                fields.Add(new FieldInfo { Category = block.Category, LayerName = block.Layer, SequenceNumber = seq, EnglishFieldName = eng, ChineseFieldName = chi, Description = desc });
                i = j;
            }
            else
            {
                i++;
            }
        }
    }

        // 写对齐报告（按解析后的字段统计）
        try
        {
            string reportPath = Path.Combine(@"e:\\spark-view\\沙市区二轮延包基础数据", "三资字段对齐报告.txt");
            using (var sw = new StreamWriter(reportPath, false, Encoding.UTF8))
            {
                sw.WriteLine("三资字段对齐报告（按块重建）");
                sw.WriteLine("分类 | 图层 | 记录数 | 有序号数 | 英文字段数 | 中文字段数 | 说明数");
                sw.WriteLine("----|------|------|--------|----------|----------|------");

                var groups = fields.GroupBy(f => (f.Category ?? "", f.LayerName ?? ""));
                foreach (var g in groups)
                {
                    string cat = g.Key.Item1; string layer = g.Key.Item2;
                    int total = g.Count();
                    int seqN = g.Count(x => x.SequenceNumber > 0);
                    int engN = g.Count(x => !string.IsNullOrEmpty(x.EnglishFieldName));
                    int chiN = g.Count(x => !string.IsNullOrEmpty(x.ChineseFieldName));
                    int descN = g.Count(x => !string.IsNullOrEmpty(x.Description));
                    sw.WriteLine($"{cat} | {layer} | {total} | {seqN} | {engN} | {chiN} | {descN}");
                    int idx = 1;
                    foreach (var item in g.Take(8)) sw.WriteLine($"  示例 {idx++}: 序号={item.SequenceNumber} 英文={item.EnglishFieldName} 中文={item.ChineseFieldName} 说明={item.Description}");
                }
            }
            Console.WriteLine($"已生成对齐报告: {reportPath}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"写报告失败: {ex.Message}");
        }

        // 导出 CSV 以便人工校对（按分类）
        try
        {
            string csvPath = Path.Combine(@"e:\\spark-view\\沙市区二轮延包基础数据", "三资字段_by_category.csv");
            using (var sw = new StreamWriter(csvPath, false, Encoding.UTF8))
            {
                sw.WriteLine("分类,图层名称,序号,字段英文名称,字段中文名称,说明");
                foreach (var f in fields)
                {
                    string line = $"{EscapeCsv(f.Category)},{EscapeCsv(f.LayerName)},{f.SequenceNumber},{EscapeCsv(f.EnglishFieldName)},{EscapeCsv(f.ChineseFieldName)},{EscapeCsv(f.Description)}";
                    sw.WriteLine(line);
                }
            }
            Console.WriteLine($"已导出 CSV: {csvPath}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"写 CSV 失败: {ex.Message}");
        }
    }

    // 根据块结构从 Markdown 中构建块（分类+图层+行）
    static List<(string Category, string Layer, List<string> Lines)> GetBlocksFromMarkdown(string tableContent)
    {
        var lines = tableContent.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                           .Select(line => line.Trim())
                           .Where(line => !string.IsNullOrWhiteSpace(line) && !line.Contains("—") && !line.Contains("\f"))
                           .ToList();

        string currentCategory = "";
        string currentLayerName = "";
        var skipExact = new HashSet<string> { "资源", "图斑", "宅基地", "分类 图层名称 序号", "字段英文名称", "字段中文名称", "说明", "序号", "分类", "图层名称" };

        var blocks = new List<(string Category, string Layer, List<string> Lines)>();
        var curBlockLines = new List<string>();

        for (int i = 0; i < lines.Count; i++)
        {
            var line = lines[i];
            if (skipExact.Contains(line)) continue;

            if (line.Contains("资源含林业") || line.Contains("二轮土地承") || line.Contains("三调地类图") || line.Contains("宅基地") ||
                line.Contains("资源性资产") || line.Contains("资产点状资产") || line.Contains("标记建筑") || line.Contains("公共"))
            {
                if (curBlockLines.Count > 0)
                {
                    blocks.Add((currentCategory, currentLayerName, new List<string>(curBlockLines)));
                    curBlockLines.Clear();
                }

                if (line.Contains("资源含林业")) { currentCategory = "林业确权"; currentLayerName = "资源"; }
                else if (line.Contains("二轮土地承")) { currentCategory = "土地承包确权"; currentLayerName = "资源"; }
                else if (line.Contains("三调地类图")) { currentCategory = "三调地类"; currentLayerName = "图斑"; }
                else if (line.Contains("宅基地")) { currentCategory = "宅基地"; currentLayerName = "宅基地"; }
                else if (line.Contains("资源性资产")) { currentCategory = "资源性资产"; currentLayerName = "资产"; }
                else if (line.Contains("资产点状资产")) { currentCategory = "点状资产"; currentLayerName = "资产"; }
                else if (line.Contains("标记建筑")) { currentCategory = "标记建筑"; currentLayerName = "资产"; }
                else if (line.Contains("公共")) { currentCategory = "公共"; currentLayerName = "公共"; }

                continue;
            }

            if (line.Contains("分类图层名称序号") || line.Contains("字段英文名称") || line.Contains("字段中文名称") || line.Contains("说明") ||
                line.Contains("包确权") || line.Contains("确权") || line.Contains("勘界") || line.Contains("水库") || line.Contains("河流") ||
                line.Contains("所有矢量图层均为 shp 格式")) continue;

            curBlockLines.Add(line);
        }
        if (curBlockLines.Count > 0) blocks.Add((currentCategory, currentLayerName, new List<string>(curBlockLines)));

        return blocks;
    }

    // 保守从 Markdown 块中自动填充缺失的英文字段名并输出变更示例
    static void AutoFillMissingEnglishFromMarkdown(List<FieldInfo> fields, string tableContent)
    {
        var blocks = GetBlocksFromMarkdown(tableContent);
        var engRegex = new System.Text.RegularExpressions.Regex(@"\b([A-Z][A-Z0-9_]{1,})\b");
        var changes = new List<(FieldInfo Field, string Old, string New)>();

        foreach (var block in blocks)
        {
            var blockFields = fields.Where(f => (f.Category ?? "") == (block.Category ?? "") && (f.LayerName ?? "") == (block.Layer ?? "")).ToList();
            if (blockFields.Count == 0) continue;

            for (int i = 0; i < blockFields.Count; i++)
            {
                var f = blockFields[i];
                if (!string.IsNullOrEmpty(f.EnglishFieldName)) continue; // 已有，跳过

                // 1) 尝试在块内按序号匹配行并提取英文字段
                bool filled = false;
                foreach (var line in block.Lines)
                {
                    var parts = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length == 0) continue;
                    if (!int.TryParse(parts[0], out int seq)) continue;
                    if (seq != f.SequenceNumber) continue;

                    var m = engRegex.Match(line);
                    if (m.Success)
                    {
                        string eng = m.Groups[1].Value;
                        f.EnglishFieldName = eng;
                        changes.Add((f, "", eng));
                        filled = true;
                        break;
                    }
                    // 若本行没有，尝试查找序号行后的几行是否带有英文字段
                    int idx = block.Lines.IndexOf(line);
                    for (int k = 1; k <= 2 && idx + k < block.Lines.Count; k++)
                    {
                        var m2 = engRegex.Match(block.Lines[idx + k]);
                        if (m2.Success)
                        {
                            string eng = m2.Groups[1].Value;
                            f.EnglishFieldName = eng;
                            changes.Add((f, "", eng));
                            filled = true;
                            break;
                        }
                    }
                    if (filled) break;
                }
                if (filled) continue;

                // 2) 若按序号找不到，则尝试按中文匹配包含中文名的行中寻找英文字段名
                if (!string.IsNullOrEmpty(f.ChineseFieldName))
                {
                    foreach (var line in block.Lines)
                    {
                        if (!line.Contains(f.ChineseFieldName)) continue;
                        var m = engRegex.Match(line);
                        if (m.Success)
                        {
                            string eng = m.Groups[1].Value;
                            f.EnglishFieldName = eng;
                            changes.Add((f, "", eng));
                            filled = true;
                            break;
                        }
                    }
                    if (filled) continue;
                }

                // 3) 尝试在块中寻找任意英文字段并按序号邻近填充（保守：仅当本块中英文字段数量接近中文数量）
                var blockEngs = block.Lines.Select(l => engRegex.Match(l)).Where(m => m.Success).Select(m => m.Groups[1].Value).Distinct().ToList();
                if (blockEngs.Count > 0 && blockEngs.Count >= 1)
                {
                    // 使用序号作为索引尝试匹配位置
                    int posIndex = f.SequenceNumber - 1;
                    if (posIndex >= 0 && posIndex < blockEngs.Count)
                    {
                        string eng = blockEngs[posIndex];
                        f.EnglishFieldName = eng;
                        changes.Add((f, "", eng));
                        continue;
                    }
                }
            }
        }

        // 写变更示例到文件，供复核（只记录前 200 项）
        try
        {
            string outDir = @"e:\\spark-view\\沙市区二轮延包基础数据";
            string diffPath = Path.Combine(outDir, "三资字段自动修复_diff示例.txt");
            using (var sw = new StreamWriter(diffPath, false, Encoding.UTF8))
            {
                sw.WriteLine("自动修复示例（只显示前200项）");
                sw.WriteLine("分类 | 图层 | 序号 | 原英文 | 新英文 | 中文 | 说明");
                sw.WriteLine("----|------|------|-------|-------|----|----");
                int c = 0;
                foreach (var chg in changes)
                {
                    sw.WriteLine($"{chg.Field.Category} | {chg.Field.LayerName} | {chg.Field.SequenceNumber} | {chg.Old} | {chg.New} | {chg.Field.ChineseFieldName} | {chg.Field.Description}");
                    if (++c >= 200) break;
                }
            }
            Console.WriteLine($"已写出自动修复示例: {Path.Combine(outDir, "三资字段自动修复_diff示例.txt")} (共{changes.Count} 条变更，已记录示例)");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"写自动修复示例失败: {ex.Message}");
        }
    }

    static bool IsFieldLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line)) return false;
        var parts = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2) return false;
        if (!int.TryParse(parts[0], out _)) return false;
        if (!IsEnglishFieldName(parts[1])) return false;
        return true;
    }

    static FieldInfo ParseFieldLine(string line, string category, string layerName)
    {
        var parts = line.Split(new[] { ' ' }, 4, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 3)
        {
            int seq = int.TryParse(parts[0], out int s) ? s : 0;
            string eng = parts[1];
            string chi = parts[2];
            string desc = parts.Length > 3 ? parts[3] : "";
            return new FieldInfo { Category = category, LayerName = layerName, SequenceNumber = seq, EnglishFieldName = eng, ChineseFieldName = chi, Description = desc };
        }
        return null;
    }

    static string EscapeCsv(string s)
    {
        if (s == null) return "";
        if (s.Contains(",") || s.Contains("\"") || s.Contains("\n"))
        {
            return "\"" + s.Replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    static bool IsEnglishFieldName(string text)
    {
        // 检查是否是英文字段名（大写字母、数字和下划线的组合，长度合理）
        if (string.IsNullOrWhiteSpace(text) || text.Length < 2 || text.Length > 20) return false;
        
        // 必须全部是大写字母、数字或下划线
        if (!text.All(c => char.IsUpper(c) || char.IsDigit(c) || c == '_')) return false;
        
        // 不能是纯数字
        if (text.All(char.IsDigit)) return false;
        
        // 不能包含连续的下划线
        if (text.Contains("__")) return false;
        
        return true;
    }

    static bool IsChineseFieldName(string text)
    {
        // 检查是否包含中文字符
        return text.Any(c => c >= 0x4E00 && c <= 0x9FFF);
    }

    static bool IsDescriptionLine(string text)
    {
        // 检查是否是说明行（包含中文字符的描述性文本）
        if (string.IsNullOrWhiteSpace(text) || text.Length < 2) return false;
        
        // 如果是纯英文字段名，不是说明
        if (IsEnglishFieldName(text)) return false;
        
        // 如果是纯中文字段名（不含标点和空格），不是说明
        if (IsChineseFieldName(text) && !text.Contains(" ") && !text.Contains("，") && !text.Contains("。") && !text.Contains("；") && !text.Contains("：")) return false;
        
        // 如果是纯数字，不是说明
        if (int.TryParse(text.Trim(), out _)) return false;
        
        // 其他包含中文的行认为是说明
        return text.Any(c => c >= 0x4E00 && c <= 0x9FFF);
    }
}

public class FieldInfo
{
    public string Category { get; set; }
    public string LayerName { get; set; }
    public int SequenceNumber { get; set; }
    public string EnglishFieldName { get; set; }
    public string ChineseFieldName { get; set; }
    public string Description { get; set; }
}