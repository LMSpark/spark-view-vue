/**
 * @module app:services/requirement-import/docx-parser
 * 职责：将 .docx 文件解析为纯文本，供需求导入 Agent 消费。
 * 边界：只负责文件格式转换，不涉及 AI 调用或项目模型写入。
 * AI用途：理解需求文档如何被提取为文本时，用本模块确认解析链路。
 */
import mammoth from 'mammoth'

/**
 * 将 .docx 文件解析为纯文本。
 *
 * 使用 mammoth.extractRawText 提取语义文本（不含格式标记），
 * 适合作为 LLM 输入。如需保留标题/表格结构，可改用
 * mammoth.convertToHtml 并提取 HTML 标记。
 */
export async function parseDocxToText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value.trim()
}

/**
 * 校验文件是否为 .docx 格式。
 */
export function isDocxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.docx')
    || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
