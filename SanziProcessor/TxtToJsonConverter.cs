using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

class TxtToJsonConverter
{
    static void Main(string[] args)
    {
        try
        {
            // 读取txt文件
            string txtPath = @"e:\spark-view\沙市区二轮延包基础数据\三资矢量数据格式要求20241210_表格格式.txt";
            string[] lines = File.ReadAllLines(txtPath, Encoding.UTF8);

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

            // 解析txt内容
            ParseTxtContent(lines, data);

            // 保存为JSON
            string jsonPath = @"e:\spark-view\沙市区二轮延包基础数据\三资矢量数据格式要求20241210_corrected.json";
            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };
            string jsonContent = JsonSerializer.Serialize(data, options);
            File.WriteAllText(jsonPath, jsonContent, Encoding.UTF8);

            Console.WriteLine($"成功转换完成！");
            Console.WriteLine($"共处理了 {data.Tables.Count} 个表");
            Console.WriteLine($"JSON文件已保存到: {jsonPath}");

        }
        catch (Exception ex)
        {
            Console.WriteLine($"处理过程中出现错误: {ex.Message}");
        }
    }

    static void ParseTxtContent(string[] lines, SanziData data)
    {
        int i = 0;

        // 跳过标题
        while (i < lines.Length && !lines[i].StartsWith("表名:"))
        {
            i++;
        }

        // 解析表
        while (i < lines.Length)
        {
            if (lines[i].StartsWith("表名:"))
            {
                var table = ParseTable(lines, ref i);
                if (table != null)
                {
                    data.Tables.Add(table);
                }
            }
            else if (lines[i].StartsWith("字典表:"))
            {
                var dict = ParseDictionary(lines, ref i);
                if (dict != null)
                {
                    data.Dictionaries.Add(dict);
                }
            }
            else
            {
                i++;
            }
        }
    }

    static Table ParseTable(string[] lines, ref int index)
    {
        var table = new Table();

        // 解析表名
        if (index < lines.Length && lines[index].StartsWith("表名:"))
        {
            table.TableName = lines[index].Substring(4).Trim();
            index++;
        }

        // 解析分类
        if (index < lines.Length && lines[index].StartsWith("分类:"))
        {
            table.Category = lines[index].Substring(4).Trim();
            index++;
        }

        // 解析描述
        if (index < lines.Length && lines[index].StartsWith("描述:"))
        {
            table.Description = lines[index].Substring(4).Trim();
            index++;
        }

        // 跳过空行
        while (index < lines.Length && string.IsNullOrWhiteSpace(lines[index]))
        {
            index++;
        }

        // 跳过表头
        if (index < lines.Length && lines[index].Contains("序号"))
        {
            index++; // 表头
        }
        if (index < lines.Length && lines[index].Contains("-"))
        {
            index++; // 分隔线
        }

        // 解析字段
        table.Fields = new List<Field>();
        int fieldId = 1;

        while (index < lines.Length && !string.IsNullOrWhiteSpace(lines[index]) &&
               !lines[index].StartsWith("表名:") && !lines[index].StartsWith("字典表:"))
        {
            var field = ParseField(lines[index], fieldId);
            if (field != null)
            {
                table.Fields.Add(field);
                fieldId++;
            }
            index++;
        }

        // 跳过空行
        while (index < lines.Length && string.IsNullOrWhiteSpace(lines[index]))
        {
            index++;
        }

        return table;
    }

    static Field ParseField(string line, int id)
    {
        if (string.IsNullOrWhiteSpace(line)) return null;

        // 分割行，处理制表符，保留空字符串
        var parts = line.Split(new[] { '\t' }, StringSplitOptions.None);
        if (parts.Length < 14) return null;

        return new Field
        {
            Id = id,
            Code = parts.Length > 1 ? parts[1].Trim() : "", // 字段名称
            Name = parts.Length > 3 ? parts[3].Trim() : "", // 字段代码
            Type = parts.Length > 5 ? parts[5].Trim() : "String",
            Length = parts.Length > 7 && int.TryParse(parts[7].Trim(), out int len) ? len : null,
            Decimal = parts.Length > 9 && int.TryParse(parts[9].Trim(), out int dec) ? dec : null,
            ValueRange = parts.Length > 11 ? parts[11].Trim() : null,
            Constraint = parts.Length > 13 ? parts[13].Trim() : null,
            Description = "",
            Format = null
        };
    }

    static DictionaryTable ParseDictionary(string[] lines, ref int index)
    {
        var dict = new DictionaryTable();

        // 解析字典表名
        if (index < lines.Length && lines[index].StartsWith("字典表:"))
        {
            dict.DictionaryName = lines[index].Substring(5).Trim();
            index++;
        }

        // 解析描述
        if (index < lines.Length && lines[index].StartsWith("描述:"))
        {
            dict.Description = lines[index].Substring(4).Trim();
            index++;
        }

        // 跳过空行
        while (index < lines.Length && string.IsNullOrWhiteSpace(lines[index]))
        {
            index++;
        }

        // 跳过表头
        if (index < lines.Length && lines[index].Contains("编码"))
        {
            index++; // 表头
        }
        if (index < lines.Length && lines[index].Contains("-"))
        {
            index++; // 分隔线
        }

        // 解析字典项
        dict.Items = new List<DictionaryItem>();

        while (index < lines.Length && !string.IsNullOrWhiteSpace(lines[index]) &&
               !lines[index].StartsWith("表名:") && !lines[index].StartsWith("字典表:"))
        {
            var item = ParseDictionaryItem(lines[index]);
            if (item != null)
            {
                dict.Items.Add(item);
            }
            index++;
        }

        return dict;
    }

    static DictionaryItem ParseDictionaryItem(string line)
    {
        if (string.IsNullOrWhiteSpace(line)) return null;

        var parts = line.Split(new[] { '\t' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2) return null;

        return new DictionaryItem
        {
            Code = parts[0].Trim(),
            Name = parts[1].Trim()
        };
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