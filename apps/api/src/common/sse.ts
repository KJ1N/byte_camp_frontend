import type { AiStreamEvent } from "@bytecamp-aigc/shared";

export interface SseResponse {
  setHeader(key: string, value: string): void;
  write(chunk: string): void;
  end(): void;
}

export async function writeSse(response: SseResponse, events: AsyncIterable<AiStreamEvent> | Iterable<AiStreamEvent>) {
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");

  try {
    for await (const event of events) {
      response.write(encodeSseEvent(event));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI stream failed";
    response.write(encodeSseEvent({ event: "error", data: { message } }));
  } finally {
    response.end();
  }
}

export function encodeSseEvent(event: AiStreamEvent) {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
