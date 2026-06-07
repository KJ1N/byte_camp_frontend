import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  AuditDecision,
  DraftMode,
  DraftStatus,
  RiskCategory,
  type AiStreamEvent,
  type RichTextDocument,
} from "@bytecamp-aigc/shared";
import { ComplianceRewriteService } from "./compliance-rewrite.service";

const body: RichTextDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "案例里包含身份证号和手机号，需要发布前处理。" }],
    },
  ],
};

const draft = {
  id: "draft-1",
  authorId: "user-1",
  mode: DraftMode.Fast,
  status: DraftStatus.Draft,
  title: "发布前安全检查",
  body,
  version: 1,
  createdAt: new Date("2026-06-06T10:00:00.000Z"),
  updatedAt: new Date("2026-06-06T10:00:00.000Z"),
};

const warnAudit = {
  id: "audit-1",
  draftId: "draft-1",
  decision: AuditDecision.Warn,
  riskLevel: "medium",
  categories: [RiskCategory.SensitiveInfo],
  rawResult: {
    decision: AuditDecision.Warn,
    riskLevel: "medium",
    categories: [RiskCategory.SensitiveInfo],
    evidence: [{ text: "身份证号和手机号", reason: "包含敏感个人信息" }],
    rewriteSuggestions: ["删除或脱敏个人信息"],
    summary: "内容需要修改后重新审核。",
  },
  createdAt: new Date("2026-06-06T10:10:00.000Z"),
};

function createService(options: {
  draft?: typeof draft | null;
  audit?: typeof warnAudit | null;
  providerEvents?: AiStreamEvent[];
} = {}) {
  const calls = {
    draftQueries: [] as Array<{ id: string; authorId: string }>,
    auditQueries: [] as Array<{ draftId: string; id?: string }>,
    rewriteContexts: [] as Array<{ title: string; bodyText: string }>,
  };

  const prisma = {
    draft: {
      findFirst: async ({ where }: { where: { id: string; authorId: string } }) => {
        calls.draftQueries.push(where);
        return options.draft === undefined ? draft : options.draft;
      },
    },
    auditRecord: {
      findFirst: async ({ where }: { where: { draftId: string; id?: string } }) => {
        calls.auditQueries.push(where);
        return options.audit === undefined ? warnAudit : options.audit;
      },
    },
  };

  const aiGateway = {
    streamComplianceRewrite: async function* (context: { title: string; bodyText: string }): AsyncGenerator<AiStreamEvent> {
      calls.rewriteContexts.push(context);
      yield* options.providerEvents ?? [
        { event: "meta", data: { model: "mock-model" } },
        { event: "text-delta", data: { text: "合规改写后: 案例里包含已脱敏信息。" } },
        { event: "suggestion", data: { text: "已删除敏感个人信息" } },
        {
          event: "done",
          data: {
            bodyText: "合规改写后: 案例里包含已脱敏信息。",
            body,
            suggestions: ["已删除敏感个人信息"],
          },
        },
      ];
    },
  };

  return {
    service: new ComplianceRewriteService(prisma as never, aiGateway as never),
    calls,
  };
}

describe("ComplianceRewriteService", () => {
  it("streams compliance rewrite events for an owned warn audit and attaches draft metadata to done", async () => {
    const { service, calls } = createService();

    const events: AiStreamEvent[] = [];
    for await (const event of service.streamComplianceRewrite("user-1", {
      draftId: "draft-1",
      auditRecordId: "audit-1",
    })) {
      events.push(event);
    }

    assert.deepEqual(calls.draftQueries, [{ id: "draft-1", authorId: "user-1" }]);
    assert.deepEqual(calls.auditQueries, [{ draftId: "draft-1", id: "audit-1" }]);
    assert.equal(calls.rewriteContexts[0].title, "发布前安全检查");
    assert.match(calls.rewriteContexts[0].bodyText, /身份证号和手机号/);
    assert.deepEqual(events.map((event) => event.event), ["meta", "text-delta", "suggestion", "done"]);
    assert.equal(events.at(-1)!.event, "done");
    assert.equal((events.at(-1)!.data as { draftId: string }).draftId, "draft-1");
    assert.equal((events.at(-1)!.data as { auditRecordId: string }).auditRecordId, "audit-1");
  });

  it("rejects a draft that does not belong to the current user", async () => {
    const { service } = createService({ draft: null });

    await assert.rejects(
      async () => {
        for await (const _event of service.streamComplianceRewrite("user-2", { draftId: "draft-1" })) {
          // drain
        }
      },
      NotFoundException,
    );
  });

  it("requires an existing audit record before rewriting", async () => {
    const { service } = createService({ audit: null });

    await assert.rejects(
      async () => {
        for await (const _event of service.streamComplianceRewrite("user-1", { draftId: "draft-1" })) {
          // drain
        }
      },
      BadRequestException,
    );
  });

  it("rejects pass audits because there is no risk to rewrite", async () => {
    const { service } = createService({
      audit: {
        ...warnAudit,
        decision: AuditDecision.Pass,
        rawResult: {
          decision: AuditDecision.Pass,
          riskLevel: "none",
          categories: [],
          evidence: [],
          rewriteSuggestions: [],
          summary: "未发现明显风险。",
        },
      },
    });

    await assert.rejects(
      async () => {
        for await (const _event of service.streamComplianceRewrite("user-1", { draftId: "draft-1" })) {
          // drain
        }
      },
      BadRequestException,
    );
  });
});
