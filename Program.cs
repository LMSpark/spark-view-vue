using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

class Program
{
    static void Main(string[] args)
    {
        try
        {
            // 读取markdown内容
            string markdownPath = @"e:\spark-view\沙市区二轮延包基础数据\三资矢量数据格式要求20241210.md";
            string markdownContent = File.ReadAllText(markdownPath, Encoding.UTF8);

            // 解析数据
            var data = ParseMarkdownContent(markdownContent);

            // 保存为JSON
            string jsonPath = @"e:\spark-view\沙市区二轮延包基础数据\三资矢量数据格式要求20241210.json";
            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };
            string jsonContent = JsonSerializer.Serialize(data, options);
            File.WriteAllText(jsonPath, jsonContent, Encoding.UTF8);

            Console.WriteLine($"成功处理了 {data.Tables.Count} 个表");
            Console.WriteLine($"JSON文件已保存到: {jsonPath}");

            // 生成表格格式文本
            GenerateTableFormat(data, @"e:\spark-view\沙市区二轮延包基础数据\三资矢量数据格式要求20241210_表格格式.txt");

        }
        catch (Exception ex)
        {
            Console.WriteLine($"处理过程中出现错误: {ex.Message}");
        }
    }

    static SanziData ParseMarkdownContent(string content)
    {
        var data = new SanziData
        {
            Metadata = new Metadata
            {
                Title = "三资矢量数据格式要求",
                SourceFile = "三资矢量数据格式要求20241210.pdf",
                ExportTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            },
            Tables = new List<Table>(),
            Dictionaries = new List<DictionaryTable>()
        };

        // 解析资源类型数据字典
        ParseResourceDictionary(content, data);

        // 解析矢量图层属性表
        ParseVectorLayerTables(content, data);

        return data;
    }

    static void ParseResourceDictionary(string content, SanziData data)
    {
        var dictTable = new DictionaryTable
        {
            DictionaryName = "资源类型数据字典",
            Description = "资源类型分类编码",
            Items = new List<DictionaryItem>()
        };

        // 查找资源类型数据字典部分
        var dictPattern = @"资源类型数据字典：([\s\S]*?)(?=\(\d\)|$)";
        var dictMatch = Regex.Match(content, dictPattern, RegexOptions.Singleline);

        if (dictMatch.Success)
        {
            var dictContent = dictMatch.Groups[1].Value;
            var lines = dictContent.Split('\n').Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (trimmed.Contains(' '))
                {
                    var parts = trimmed.Split(new[] { ' ' }, 2, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length == 2)
                    {
                        dictTable.Items.Add(new DictionaryItem
                        {
                            Code = parts[0],
                            Name = parts[1]
                        });
                    }
                }
            }
        }

        data.Dictionaries.Add(dictTable);
    }

    static void ParseVectorLayerTables(string content, SanziData data)
    {
        // 查找属性表格式部分
        var tablePattern = @"矢量图层属性表格式([\s\S]*?)(?=$)";
        var tableMatch = Regex.Match(content, tablePattern, RegexOptions.Singleline);

        if (tableMatch.Success)
        {
            var tableContent = tableMatch.Groups[1].Value;

            // 解析表头
            var headerPattern = @"分类\s+图层名称\s+序号\s+字段英文名称\s+字段中文名称\s+说明";
            var headerMatch = Regex.Match(tableContent, headerPattern);

            if (headerMatch.Success)
            {
                var tableData = tableContent.Substring(headerMatch.Index + headerMatch.Length);

                // 按分类分组解析
                var categoryPattern = @"(\w+)\s+([^\n]+)(?:\n|\r\n)(.*?)(?=\w+\s+[^\n]+(?:\n|\r\n)|$)";
                var categoryMatches = Regex.Matches(tableData, categoryPattern, RegexOptions.Singleline);

                foreach (Match categoryMatch in categoryMatches)
                {
                    var category = categoryMatch.Groups[1].Value.Trim();
                    var layerName = categoryMatch.Groups[2].Value.Trim();
                    var fieldsContent = categoryMatch.Groups[3].Value;

                    var table = new Table
                    {
                        TableName = layerName,
                        Category = category,
                        Description = GetTableDescription(layerName),
                        Fields = new List<Field>()
                    };

                    // 解析字段
                    ParseFields(fieldsContent, table);
                    data.Tables.Add(table);
                }
            }
        }
    }

    static void ParseFields(string fieldsContent, Table table)
    {
        var lines = fieldsContent.Split('\n').Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
        int id = 1;

        for (int i = 0; i < lines.Length; i += 5) // 每5行一个字段记录
        {
            if (i + 4 < lines.Length)
            {
                try
                {
                    var seqLine = lines[i].Trim();
                    var engNameLine = lines[i + 1].Trim();
                    var chnNameLine = lines[i + 2].Trim();
                    var descLine = lines[i + 3].Trim();
                    var emptyLine = lines[i + 4].Trim();

                    if (int.TryParse(seqLine, out _) &&
                        !string.IsNullOrEmpty(engNameLine) &&
                        !string.IsNullOrEmpty(chnNameLine))
                    {
                        table.Fields.Add(new Field
                        {
                            Id = id++,
                            Name = engNameLine,
                            Code = chnNameLine,
                            Type = "String", // 默认类型
                            Length = null,
                            Decimal = null,
                            Constraint = "O", // 默认可选
                            ValueRange = null,
                            Format = null,
                            Description = descLine
                        });
                    }
                }
                catch
                {
                    // 跳过解析错误的行
                }
            }
        }
    }

    static string GetTableDescription(string tableName)
    {
        var descriptions = new Dictionary<string, string>
        {
            {"资源含林业确权", "林业确权等相关资源"},
            {"资源", "二轮土地承包确权"},
            {"二轮土地承包确权", "承包到户确权数据"},
            {"三调地类图斑", "第三次全国国土调查地类图斑"},
            {"宅基地", "农村宅基地资源"},
            {"资源性资产", "面状资源"},
            {"资产", "点状资产"},
            {"点状资产", "固定资产中不适宜绘制面状矢量的建筑或工程设施"},
            {"标记建筑", "面状资产"},
            {"面状资产", "固定资产中大型房产建筑"},
            {"村级行政区划勘界", "村级行政区划"},
            {"镇级行政区划勘界", "镇级行政区划"},
            {"区县行政区划勘界", "区县行政区划"},
            {"水库", "水利设施"},
            {"河流", "水系"}
        };

        return descriptions.ContainsKey(tableName) ? descriptions[tableName] : tableName;
    }

    static void GenerateTableFormat(SanziData data, string outputPath)
    {
        using (var writer = new StreamWriter(outputPath, false, Encoding.UTF8))
        {
            writer.WriteLine("三资矢量数据格式要求 - 字段结构表");
            writer.WriteLine($"导出时间: {data.Metadata.ExportTime}");
            writer.WriteLine(new string('=', 100));
            writer.WriteLine();

            foreach (var table in data.Tables)
            {
                writer.WriteLine($"表名: {table.TableName}");
                writer.WriteLine($"分类: {table.Category}");
                writer.WriteLine($"描述: {table.Description}");
                writer.WriteLine();

                writer.WriteLine("序号\t字段名称\t字段代码\t字段类型\t字段长度\t小数位数\t值域\t约束条件");
                writer.WriteLine(new string('-', 80));

                foreach (var field in table.Fields)
                {
                    writer.WriteLine($"{field.Id}\t{field.Name}\t{field.Code}\t{field.Type}\t{field.Length ?? 0}\t{field.Decimal ?? 0}\t{field.ValueRange ?? ""}\t{field.Constraint ?? ""}");
                }

                writer.WriteLine();
                writer.WriteLine(new string('=', 100));
                writer.WriteLine();
            }

            // 输出字典表
            foreach (var dict in data.Dictionaries)
            {
                writer.WriteLine($"字典表: {dict.DictionaryName}");
                writer.WriteLine($"描述: {dict.Description}");
                writer.WriteLine();

                writer.WriteLine("代码\t名称");
                writer.WriteLine(new string('-', 40));

                foreach (var item in dict.Items)
                {
                    writer.WriteLine($"{item.Code}\t{item.Name}");
                }

                writer.WriteLine();
                writer.WriteLine(new string('=', 100));
                writer.WriteLine();
            }
        }
    }
}

public class SanziData
{
    public Metadata Metadata { get; set; }
    public List<Table> Tables { get; set; }
    public List<DictionaryTable> Dictionaries { get; set; }
}

public class Metadata
{
    public string Title { get; set; }
    public string SourceFile { get; set; }
    public string ExportTime { get; set; }
}

public class Table
{
    public string TableName { get; set; }
    public string Category { get; set; }
    public string Description { get; set; }
    public List<Field> Fields { get; set; }
}

public class Field
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Code { get; set; }
    public string Type { get; set; }
    public int? Length { get; set; }
    public int? Decimal { get; set; }
    public string Constraint { get; set; }
    public string ValueRange { get; set; }
    public string Format { get; set; }
    public string Description { get; set; }
}

public class DictionaryTable
{
    public string DictionaryName { get; set; }
    public string Description { get; set; }
    public List<DictionaryItem> Items { get; set; }
}

public class DictionaryItem
{
    public string Code { get; set; }
    public string Name { get; set; }
}