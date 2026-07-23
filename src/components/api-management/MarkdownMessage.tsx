import { createElement, Fragment, useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

import { parseMarkdownBlocks } from "./markdownMessageParser";

interface MarkdownMessageProps {
  className?: string;
  content: string;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const token = match[0];
    const key = `${keyPrefix}-${tokenIndex}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded-md border border-cyan-200/15 bg-slate-950/60 px-1.5 py-0.5 font-mono text-[0.88em] text-cyan-100">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key} className="font-black text-slate-50">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push(<em key={key} className="text-slate-200">{token.slice(1, -1)}</em>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a
            key={key}
            href={linkMatch[2]}
            target={linkMatch[2].startsWith("http") ? "_blank" : undefined}
            rel={linkMatch[2].startsWith("http") ? "noreferrer" : undefined}
            className="font-semibold text-cyan-200 underline decoration-cyan-300/35 underline-offset-4 hover:text-cyan-100"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }

    cursor = start + token.length;
    tokenIndex += 1;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderInlineWithBreaks(text: string, keyPrefix: string) {
  return text.split("\n").map((line, index) => (
    <Fragment key={`${keyPrefix}-line-${index}`}>
      {index > 0 ? <br /> : null}
      {renderInlineMarkdown(line, `${keyPrefix}-${index}`)}
    </Fragment>
  ));
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-slate-600/55 bg-[#050b14] shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
      <div className="flex items-center justify-between border-b border-slate-700/70 bg-[#0d1725] px-4 py-2.5">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200/80">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/60 bg-slate-800/70 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/45 hover:text-cyan-100"
          aria-label="複製程式碼"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "已複製" : "複製"}
        </button>
      </div>
      <pre className="max-h-[520px] overflow-auto p-4 text-[13px] leading-6 [scrollbar-width:thin]">
        <code className="font-mono text-slate-100">{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownMessage({ className, content }: MarkdownMessageProps) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className={cn("min-w-0 text-[15px] leading-7 text-slate-100", className)} data-ui="ai-markdown-message">
      {blocks.map((block, index) => {
        const key = `markdown-block-${index}`;

        if (block.type === "heading") {
          const headingClass = block.level === 1
            ? "mb-3 mt-5 text-2xl"
            : block.level === 2
              ? "mb-2.5 mt-5 text-xl"
              : "mb-2 mt-4 text-base";
          return createElement(
            `h${Math.min(block.level, 6)}`,
            { className: cn("font-black tracking-tight text-slate-50 first:mt-0", headingClass), key },
            renderInlineMarkdown(block.text, key),
          );
        }

        if (block.type === "divider") {
          return <hr key={key} className="my-5 border-0 border-t border-slate-600/55" />;
        }

        if (block.type === "code") {
          return <CodeBlock key={key} code={block.code} language={block.language} />;
        }

        if (block.type === "table") {
          return (
            <div key={key} className="my-4 max-w-full overflow-x-auto rounded-2xl border border-slate-600/50 [scrollbar-width:thin]">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead className="bg-[linear-gradient(180deg,#17263a,#122033)] text-slate-100">
                  <tr>
                    {block.headers.map((header, cellIndex) => (
                      <th
                        key={`${key}-head-${cellIndex}`}
                        className="border-b border-r border-slate-600/55 px-4 py-3 font-black last:border-r-0"
                        style={{ textAlign: block.alignments[cellIndex] }}
                      >
                        {renderInlineMarkdown(header, `${key}-head-${cellIndex}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${key}-row-${rowIndex}`} className="odd:bg-slate-950/30 even:bg-slate-800/25 hover:bg-cyan-300/5">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${key}-cell-${rowIndex}-${cellIndex}`}
                          className="border-b border-r border-slate-700/55 px-4 py-3 align-top text-slate-200 last:border-r-0"
                          style={{ textAlign: block.alignments[cellIndex] }}
                        >
                          {renderInlineMarkdown(cell, `${key}-cell-${rowIndex}-${cellIndex}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={key} className={cn("my-3 space-y-1.5 pl-6 text-slate-200", block.ordered ? "list-decimal" : "list-disc marker:text-cyan-300")}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-item-${itemIndex}`} className="pl-1">
                  {renderInlineMarkdown(item, `${key}-item-${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote key={key} className="my-4 rounded-r-xl border-l-4 border-cyan-300/60 bg-cyan-300/6 px-4 py-3 text-slate-300">
              {renderInlineWithBreaks(block.text, key)}
            </blockquote>
          );
        }

        return (
          <p key={key} className="my-3 text-slate-200 first:mt-0 last:mb-0">
            {renderInlineWithBreaks(block.text, key)}
          </p>
        );
      })}
    </div>
  );
}

