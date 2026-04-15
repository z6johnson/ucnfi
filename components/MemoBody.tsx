/**
 * Minimal markdown renderer for memo bodies. Intentionally supports a
 * small subset that memos actually use:
 *
 *   - `# / ## / ###` headings
 *   - blank-line-separated paragraphs
 *   - `- ` bulleted lists
 *   - `1. ` ordered lists
 *   - `> ` blockquotes
 *   - `**bold**` / `*italic*`
 *   - `[label](url)` external links
 *   - `[entity_id]` inline citation chips linking to /baseline/[id]
 *
 * No code blocks, no tables, no images. Keeps the dependency surface
 * zero and the output fully controlled by our design system.
 */

import Link from "next/link";

type Props = {
  body: string;
  knownEntityIds: Set<string>;
};

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "blockquote"; text: string };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({
        type: "heading",
        level: h[1].length as 1 | 2 | 3,
        text: h[2].trim(),
      });
      i += 1;
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^-\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (/^>\s*/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s*/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s*/, ""));
        i += 1;
      }
      blocks.push({ type: "blockquote", text: buf.join(" ") });
      continue;
    }

    // Default: paragraph — consume until blank line or structural marker.
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^-\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^>\s*/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", text: buf.join(" ") });
  }

  return blocks;
}

// Inline tokens: **bold**, *italic*, [text](url), [entity_id]
// We tokenize left-to-right and dispatch in renderInline.

function renderInline(
  text: string,
  knownEntityIds: Set<string>,
  keyBase: string,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let keyIdx = 0;
  const push = (node: React.ReactNode) => {
    out.push(node);
  };

  // Regex with alternation: we find the next match of any token.
  const pattern =
    /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)|\[([a-z0-9_]+)\]/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      push(text.slice(cursor, match.index));
    }
    const key = `${keyBase}-${keyIdx++}`;
    if (match[1] !== undefined) {
      push(<strong key={key}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      push(<em key={key}>{match[2]}</em>);
    } else if (match[3] !== undefined && match[4] !== undefined) {
      push(
        <a key={key} href={match[4]} target="_blank" rel="noreferrer noopener">
          {match[3]}
        </a>,
      );
    } else if (match[5] !== undefined) {
      const id = match[5];
      if (knownEntityIds.has(id)) {
        push(
          <Link
            key={key}
            href={`/baseline/${id}`}
            className="citation-chip"
            title={`Open ${id} in the baseline explorer`}
          >
            {id}
          </Link>,
        );
      } else {
        push(match[0]);
      }
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    push(text.slice(cursor));
  }
  return out;
}

export function MemoBody({ body, knownEntityIds }: Props) {
  const blocks = parseBlocks(body);
  return (
    <article className="memo-body">
      {blocks.map((block, i) => {
        const key = `b-${i}`;
        if (block.type === "heading") {
          if (block.level === 1) {
            return (
              <h2
                key={key}
                className="display mt-10"
                style={{ fontSize: "var(--text-xl)" }}
              >
                {renderInline(block.text, knownEntityIds, key)}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3
                key={key}
                className="display mt-10"
                style={{ fontSize: "var(--text-lg)" }}
              >
                {renderInline(block.text, knownEntityIds, key)}
              </h3>
            );
          }
          return (
            <h4
              key={key}
              className="label mt-8"
              style={{ color: "var(--color-text-muted)" }}
            >
              {renderInline(block.text, knownEntityIds, key)}
            </h4>
          );
        }
        if (block.type === "paragraph") {
          return (
            <p
              key={key}
              className="prose-body mt-4"
              style={{ color: "var(--color-text)" }}
            >
              {renderInline(block.text, knownEntityIds, key)}
            </p>
          );
        }
        if (block.type === "ul") {
          return (
            <ul
              key={key}
              className="prose-body mt-4 flex list-disc flex-col gap-2 pl-6"
              style={{ color: "var(--color-text)" }}
            >
              {block.items.map((item, j) => (
                <li key={`${key}-${j}`}>
                  {renderInline(item, knownEntityIds, `${key}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol
              key={key}
              className="prose-body mt-4 flex list-decimal flex-col gap-2 pl-6"
              style={{ color: "var(--color-text)" }}
            >
              {block.items.map((item, j) => (
                <li key={`${key}-${j}`}>
                  {renderInline(item, knownEntityIds, `${key}-${j}`)}
                </li>
              ))}
            </ol>
          );
        }
        return (
          <blockquote
            key={key}
            className="rail-accent prose-body mt-6"
            style={{
              borderLeftColor: "var(--color-border-heavy)",
              color: "var(--color-text-muted)",
            }}
          >
            {renderInline(block.text, knownEntityIds, key)}
          </blockquote>
        );
      })}
    </article>
  );
}
