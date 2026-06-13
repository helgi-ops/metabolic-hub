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

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
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
      list.push(bullet[1]);
    } else if (quote) {
      flushPara();
      flushList();
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
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();

  return <div className="space-y-4 text-foreground/90">{blocks.map((b, i) => (
    <Fragment key={i}>{b}</Fragment>
  ))}</div>;
}
