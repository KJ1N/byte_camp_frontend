import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AiStreamEvent } from "@bytecamp-aigc/shared";
import { AuditController } from "./audit.controller";

function createResponse() {
  return {
    headers: new Map<string, string>(),
    chunks: [] as string[],
    ended: false,
    setHeader(key: string, value: string) {
      this.headers.set(key, value);
    },
    write(chunk: string) {
      this.chunks.push(chunk);
    },
    end() {
      this.ended = true;
    },
  };
}

describe("AuditController", () => {
  it("streams compliance rewrite events for the current user", async () => {
    const calls: Array<{ userId: string; draftId: string; auditRecordId?: string }> = [];
    const publishService = {
      checkDraft: async () => ({ ok: true }),
    };
    const complianceRewriteService = {
      streamComplianceRewrite: async function* (userId: string, input: { draftId: string; auditRecordId?: string }): AsyncGenerator<AiStreamEvent> {
        calls.push({ userId, ...input });
        yield { event: "done", data: { draftId: input.draftId, auditRecordId: input.auditRecordId ?? "audit-latest" } };
      },
    };
    const controller = new AuditController(publishService as never, complianceRewriteService as never);
    const response = createResponse();

    await controller.rewrite("user-1", { draftId: "draft-1", auditRecordId: "audit-1" }, response);

    assert.deepEqual(calls, [{ userId: "user-1", draftId: "draft-1", auditRecordId: "audit-1" }]);
    assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8");
    assert.equal(response.ended, true);
    assert.match(response.chunks.join(""), /"draftId":"draft-1"/);
  });
});
