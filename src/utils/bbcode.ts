/**
 * BBCode 转 HTML 解析工具
 * 支持 Godot 富文本语法: [color=#xxxxxx]...[/color]
 */
export function parseBBCode(text: string): string {
  if (!text) return '';
  return text.replace(
    /\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/g,
    (_, color, content) => `<span style="color: ${color}; font-weight: bold;">${content}</span>`
  );
}
