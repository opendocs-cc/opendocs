"use client";

import { MarkdownConverter } from "@/components/markdown-converter";
import { TABLE_SAMPLE, hasMarkdownTable } from "@/lib/free-tools/samples";

/** Markdown table to Word: the text converter, with a hint when there's no table. */
export function TableConverter() {
  return (
    <MarkdownConverter
      input="text"
      formats={["docx", "pdf"]}
      tool="markdown-table-to-word"
      textLabel="Paste your Markdown table"
      placeholder={"| Name | Role |\n| --- | --- |\n| Dana | Design |"}
      sample={TABLE_SAMPLE}
      fallbackFilename="table"
      hint={(text) =>
        text.trim() && !hasMarkdownTable(text)
          ? "No Markdown table found yet. A table needs a header row and a separator row like | --- | --- |."
          : null
      }
    />
  );
}
