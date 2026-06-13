import { Fragment, type ReactNode } from "react";

// A small, dependency-free Markdown renderer for lesson bodies. It covers the
// subset course authors actually use — headings, lists, bold/italic, links,
// blockquotes and paragraphs — and renders to real React nodes (no
// dangerouslySetInnerHTML, so no XSS surface even on untrusted content).

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: links first, then bold, then italic.
  const pattern =
    /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1] !== undefined) {
      const href = m[2];
      const safe = /^(https?:|mailto:|\/)/i.test(href) ? href : "#";
      nodes.push(
        <a
          key={key}
          href={safe}
          target={safe.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          {m[1]}
        </a>,
      );
    } else if (m[3] !== undefined || m[4] !== undefined) {
      nodes.push(<strong key={key}>{m[3] ?? m[4]}</strong>);
    } else {
      nodes.push(<em key={key}>{m[5] ?? m[6]}</em>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source }: { source: string | null | undefined }) {
  if (!source || !source.trim()) return null;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let table: string[] = [];
  let bi = 0;

  const flushPara = () => {
    if (para.length) {
      const text = para.join(" ");
      blocks.push(
        <p key={`p-${bi++}`} className="leading-relaxed">
          {renderInline(text, `p${bi}`)}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      const items = list;
      blocks.push(
        <ul key={`ul-${bi++}`} className="list-disc space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `li${bi}-${j}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  const splitRow = (row: string) =>
    row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const flushTable = () => {
    if (table.length) {
      // Drop a |---| separator row if present (second line).
      const rows = table.filter((r) => !/^\|?[\s|:-]+\|?$/.test(r));
      const head = splitRow(rows[0] ?? "");
      const body = rows.slice(1).map(splitRow);
      blocks.push(
        <div key={`t-${bi++}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {head.map((c, j) => (
                  <th key={j} className="px-3 py-2 font-semibold">
                    {renderInline(c, `th${bi}-${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-b border-border/60">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 align-top text-muted-foreground">
                      {renderInline(c, `td${bi}-${ri}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      table = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      flushTable();
      continue;
    }
    if (/^\|.*\|\s*$/.test(line)) {
      flushPara();
      flushList();
      table.push(line.trim());
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      flushTable();
      const level = heading[1].length;
      const cls =
        level <= 1
          ? "text-2xl font-bold mt-2"
          : level === 2
            ? "text-xl font-bold mt-2"
            : "text-lg font-semibold mt-2";
      const Tag = (`h${Math.min(level + 1, 6)}` as "h2");
      blocks.push(
        <Tag key={`h-${bi++}`} className={cls}>
          {renderInline(heading[2], `h${bi}`)}
        </Tag>,
      );
    } else if (bullet) {
      flushPara();
      flushTable();
      list.push(bullet[1]);
    } else if (quote) {
      flushPara();
      flushList();
      flushTable();
      blocks.push(
        <blockquote
          key={`q-${bi++}`}
          className="border-l-2 border-accent pl-4 text-muted-foreground italic"
        >
          {renderInline(quote[1], `q${bi}`)}
        </blockquote>,
      );
    } else {
      flushList();
      flushTable();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  flushTable();

  return <div className="space-y-4 text-foreground/90">{blocks.map((b, i) => (
    <Fragment key={i}>{b}</Fragment>
  ))}</div>;
}
