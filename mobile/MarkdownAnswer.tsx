import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

type Block =
  | { type: "fence"; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "hr" }
  | { type: "bullet"; content: string }
  | { type: "ordered"; number: number; content: string }
  | { type: "paragraph"; content: string };

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

  for (const rawLine of lines) {
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

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: "bullet", content: bullet[1] });
      continue;
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      blocks.push({
        type: "ordered",
        number: parseInt(ordered[1], 10),
        content: ordered[2],
      });
      continue;
    }

    blocks.push({ type: "paragraph", content: rawLine });
  }

  flushFence();
  return blocks;
}

function InlineText({
  content,
  style,
}: {
  content: string;
  style?: object;
}) {
  const parts = String(content || "").split(/\*\*(.+?)\*\*/g);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={styles.bold}>
            {part}
          </Text>
        ) : part ? (
          <Text key={i}>{part}</Text>
        ) : null
      )}
    </Text>
  );
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
              <Text key={i} style={style}>
                {block.content.replace(/\*\*/g, "")}
              </Text>
            );
          }
          case "hr":
            return <View key={i} style={styles.hr} />;
          case "bullet":
            return (
              <View key={i} style={styles.row}>
                <Text style={styles.marker}>•</Text>
                <InlineText content={block.content} style={styles.body} />
              </View>
            );
          case "ordered":
            return (
              <View key={i} style={styles.row}>
                <Text style={styles.marker}>{block.number}.</Text>
                <InlineText content={block.content} style={styles.body} />
              </View>
            );
          default:
            return <InlineText key={i} content={block.content} style={styles.body} />;
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
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    color: "#111827",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 4,
  },
  body: {
    color: "#374151",
    fontSize: 15,
    lineHeight: 24,
    flexShrink: 1,
  },
  bold: {
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    marginTop: 2,
    marginBottom: 2,
  },
  marker: {
    color: "#374151",
    fontSize: 15,
    lineHeight: 24,
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
    fontSize: 13,
    lineHeight: 19,
    color: "#111827",
  },
  hr: {
    height: 1,
    backgroundColor: "#d1d5db",
    marginVertical: 12,
  },
});
