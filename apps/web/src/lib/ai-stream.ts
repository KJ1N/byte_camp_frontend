import type { RichTextDocument } from "@bytecamp-aigc/shared";

export interface ParsedAiStreamEvent {
  event: string;
  data: unknown;
}

export interface TitleCandidateStreamData {
  text: string;
  index?: number;
}

export function createAiSseParser(onEvent: (event: ParsedAiStreamEvent) => void) {
  let buffer = "";

  return {
    feed(chunk: string) {
      buffer += chunk;

      while (true) {
        const separatorIndex = buffer.indexOf("\n\n");
        if (separatorIndex === -1) return;

        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const event = parseSseEvent(rawEvent);

        if (event) {
          onEvent(event);
        }
      }
    },
  };
}

export function encodeParagraphsAsRichText(text: string): RichTextDocument {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    type: "doc",
    content: (paragraphs.length ? paragraphs : [""]).map((paragraph) => ({
      type: "paragraph",
      content: paragraph ? [{ type: "text", text: paragraph }] : [],
    })),
  };
}

export function mergeTitleCandidate(items: string[], data: TitleCandidateStreamData) {
  if (typeof data.index !== "number" || data.index < 0 || !Number.isInteger(data.index)) {
    return [...items, data.text];
  }

  const nextItems = [...items];
  nextItems[data.index] = data.text;
  return nextItems.filter((item): item is string => typeof item === "string");
}

function parseSseEvent(rawEvent: string): ParsedAiStreamEvent | null {
  const lines = rawEvent.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  const dataText = dataLines.join("\n");

  return {
    event,
    data: parseData(dataText),
  };
}

function parseData(dataText: string): unknown {
  try {
    return JSON.parse(dataText);
  } catch {
    const lineValues = dataText.split("\n").map((line) => parseJsonStringLine(line));
    if (lineValues.every((value): value is string => typeof value === "string")) {
      return lineValues.join("\n");
    }

    return dataText;
  }
}

function parseJsonStringLine(line: string): string | null {
  try {
    const value = JSON.parse(line);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
