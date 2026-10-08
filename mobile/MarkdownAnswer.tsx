import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

type Block =
  | { type: "fence"; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "hr" }
  | { type: "bullet"; content: string; depth: number }
  | { type: "ordered"; number: number; content: string; depth: number }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "paragraph"; content: string };

const isTableRow = (line: string) => /\|.*\|/.test(line.trim());
const isTableDivider = (line: string) =>
  /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line.trim()) && line.includes("-");

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseBlocks(text: string): Block[] {
  const lines = String(text || "").split("\n");
  const blocks: Block[] = [];
  let fence: string[] | null = null;

  const flushFence = () => {
    if (fence !== null) {
      blocks.push({ type: "fence", content: fence.join("\n") });
      fence = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (fence !== null) {
      if (/^```\s*$/.test(trimmed)) {
        flushFence();
      } else {
        fence.push(rawLine);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      fence = [];
      continue;
    }

    if (!trimmed) continue;

    // A table needs a pipe row followed by a |---|---| divider.
    if (isTableRow(trimmed) && isTableDivider(lines[i + 1] || "")) {
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      blocks.push({ type: "table", header, rows });
      i = j - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        content: heading[2],
      });
      continue;
    }

    if (/^-{3,}\s*$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      continue;
    }

    const indent = rawLine.match(/^\s*/)?.[0].length || 0;
    const depth = Math.min(2, Math.floor(indent / 2));

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: "bullet", content: bullet[1], depth });
      continue;
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      blocks.push({
        type: "ordered",
        number: parseInt(ordered[1], 10),
        content: ordered[2],
        depth,
      });
      continue;
    }

    blocks.push({ type: "paragraph", content: rawLine });
  }

  flushFence();
  return blocks;
}

function renderInline(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const s = String(content || "");
  let i = 0;
  let key = 0;
  let plain = "";
  const flush = () => {
    if (plain) {
      nodes.push(<Text key={key++}>{plain}</Text>);
      plain = "";
    }
  };

  while (i < s.length) {
    if (s.startsWith("**", i)) {
      const end = s.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        nodes.push(
          <Text key={key++} style={styles.bold}>
            {s.slice(i + 2, end)}
          </Text>
        );
        i = end + 2;
        continue;
      }
    }

    if (s[i] === "*" && s[i + 1] !== "*") {
      const after = s[i + 1];
      // Emphasis only opens before a non-space, non-asterisk character. A `* `
      // at the start of a line is a bullet, which the block parser already
      // strips, so a preceding space is allowed here.
      if (after && after !== " " && after !== "*") {
        const end = s.indexOf("*", i + 1);
        if (end !== -1) {
          const inner = s.slice(i + 1, end);
          if (inner && inner.trim() && s[end + 1] !== "*") {
            flush();
            nodes.push(
              <Text key={key++} style={styles.italic}>
                {inner}
              </Text>
            );
            i = end + 1;
            continue;
          }
        }
      }
    }

    plain += s[i];
    i += 1;
  }

  flush();
  return nodes;
}

function InlineText({
  content,
  style,
}: {
  content: string;
  style?: object;
}) {
  return <Text style={style}>{renderInline(content)}</Text>;
}

export default function MarkdownAnswer({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "fence":
            return (
              <View key={i} style={styles.codeBlock}>
                <Text style={styles.codeText}>{block.content}</Text>
              </View>
            );
          case "heading": {
            const style = block.level <= 2 ? styles.h2 : styles.h3;
            return (
              <InlineText key={i} content={block.content} style={style} />
            );
          }
          case "hr":
            return <View key={i} style={styles.hr} />;
          case "bullet":
            return (
              <View
                key={i}
                style={[styles.row, block.depth ? styles.nested : null]}
              >
                <Text style={styles.marker}>•</Text>
                <InlineText content={block.content} style={styles.body} />
              </View>
            );
          case "ordered":
            return (
              <View
                key={i}
                style={[styles.row, block.depth ? styles.nested : null]}
              >
                <Text style={styles.marker}>{block.number}.</Text>
                <InlineText content={block.content} style={styles.body} />
              </View>
            );
          case "table":
            return (
              <View key={i} style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeadRow]}>
                  {block.header.map((cell, c) => (
                    <InlineText
                      key={c}
                      content={cell}
                      style={[styles.tableCell, styles.tableHead]}
                    />
                  ))}
                </View>
                {block.rows.map((row, r) => (
                  <View
                    key={r}
                    style={[styles.tableRow, r % 2 ? styles.tableStripe : null]}
                  >
                    {row.map((cell, c) => (
                      <InlineText
                        key={c}
                        content={cell}
                        style={styles.tableCell}
                      />
                    ))}
                  </View>
                ))}
              </View>
            );
          default:
            return (
              <InlineText
                key={i}
                content={block.content}
                style={[styles.body, styles.paragraph]}
              />
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  h2: {
    color: "#111827",
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    color: "#111827",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 4,
  },
  body: {
    color: "#111827",
    fontSize: 16,
    lineHeight: 26,
    flexShrink: 1,
  },
  paragraph: {
    marginBottom: 12,
  },
  bold: {
    fontWeight: "700",
  },
  italic: {
    fontStyle: "italic",
  },
  row: {
    flexDirection: "row",
    marginTop: 2,
    marginBottom: 2,
  },
  nested: {
    marginLeft: 16,
  },
  table: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableHeadRow: {
    backgroundColor: "#f9fafb",
    borderBottomWidth: 2,
    borderBottomColor: "#d1d5db",
  },
  tableStripe: {
    backgroundColor: "#f9fafb",
  },
  tableCell: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tableHead: {
    color: "#111827",
    fontWeight: "700",
  },
  marker: {
    color: "#111827",
    fontSize: 16,
    lineHeight: 26,
    marginRight: 6,
    fontWeight: "700",
  },
  codeBlock: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    marginBottom: 8,
    overflow: "hidden",
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 14,
    lineHeight: 20,
    color: "#111827",
  },
  hr: {
    height: 1,
    backgroundColor: "#d1d5db",
    marginVertical: 12,
  },
});
