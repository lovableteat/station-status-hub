export type MarkdownTextAlignment = "center" | "left" | "right";

export type MarkdownBlock =
  | { level: number; text: string; type: "heading" }
  | { code: string; language: string; type: "code" }
  | { type: "divider" }
  | { alignments: MarkdownTextAlignment[]; headers: string[]; rows: string[][]; type: "table" }
  | { items: string[]; ordered: boolean; type: "list" }
  | { text: string; type: "quote" }
  | { text: string; type: "paragraph" };

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const character of trimmed) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current.trim());
  return cells;
}

function isTableDivider(line: string) {
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function getTableAlignment(cell: string): MarkdownTextAlignment {
  if (cell.startsWith(":") && cell.endsWith(":")) return "center";
  if (cell.endsWith(":")) return "right";
  return "left";
}

function isDivider(line: string) {
  return /^(?:\s{0,3})(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line);
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index] ?? "";
  const nextLine = lines[index + 1] ?? "";
  return (
    /^\s{0,3}```/.test(line) ||
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*(?:[-+*]|\d+[.)])\s+/.test(line) ||
    isDivider(line) ||
    (line.includes("|") && isTableDivider(nextLine))
  );
}

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = line.match(/^\s{0,3}```\s*([^\s`]*)\s*$/);
    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s{0,3}```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        code: codeLines.join("\n"),
        language: fenceMatch[1] || "text",
        type: "code",
      });
      continue;
    }

    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      blocks.push({ level: headingMatch[1].length, text: headingMatch[2], type: "heading" });
      index += 1;
      continue;
    }

    if (isDivider(line)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1] ?? "")) {
      const headers = splitTableRow(line);
      const dividerCells = splitTableRow(lines[index + 1]);
      const alignments = headers.map((_, cellIndex) =>
        getTableAlignment(dividerCells[cellIndex] ?? "---"),
      );
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = splitTableRow(lines[index]);
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ""));
        index += 1;
      }

      blocks.push({ alignments, headers, rows, type: "table" });
      continue;
    }

    const listMatch = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
        if (!itemMatch || Boolean(itemMatch[2]) !== ordered) break;
        items.push(itemMatch[3]);
        index += 1;
      }

      blocks.push({ items, ordered, type: "list" });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ text: quoteLines.join("\n"), type: "quote" });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (paragraphLines.length > 0 && isBlockStart(lines, index)) break;
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ text: paragraphLines.join("\n"), type: "paragraph" });
  }

  return blocks;
}

