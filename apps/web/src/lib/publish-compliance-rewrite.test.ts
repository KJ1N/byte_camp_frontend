import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuditDecision } from "@bytecamp-aigc/shared";
import {
  canStartComplianceRewrite,
  getReviewStateAfterApplyingRewrite,
  isComplianceRewriteDoneData,
  isRewriteApplyDisabled,
} from "./publish-compliance-rewrite.ts";

describe("publish compliance rewrite helpers", () => {
  it("allows compliance rewrite only for warn or block audit decisions", () => {
    assert.equal(canStartComplianceRewrite(undefined), false);
    assert.equal(canStartComplianceRewrite(AuditDecision.Pass), false);
    assert.equal(canStartComplianceRewrite(AuditDecision.Warn), true);
    assert.equal(canStartComplianceRewrite(AuditDecision.Block), true);
  });

  it("accepts done data with draft metadata, body text, rich text body, and suggestions", () => {
    assert.equal(
      isComplianceRewriteDoneData({
        draftId: "draft-1",
        auditRecordId: "audit-1",
        bodyText: "合规改写后的正文",
        body: { type: "doc", content: [] },
        suggestions: ["重新审核后再发布"],
      }),
      true,
    );
  });

  it("rejects malformed done data before applying it to a draft", () => {
    assert.equal(isComplianceRewriteDoneData({ draftId: "draft-1", bodyText: "missing body" }), false);
    assert.equal(isComplianceRewriteDoneData({ body: { type: "paragraph" }, bodyText: "wrong body type" }), false);
  });

  it("keeps apply disabled until the stream has a valid done payload", () => {
    assert.equal(isRewriteApplyDisabled("streaming", null), true);
    assert.equal(
      isRewriteApplyDisabled("ready", {
        draftId: "draft-1",
        auditRecordId: "audit-1",
        bodyText: "合规改写后的正文",
        body: { type: "doc", content: [] },
        suggestions: [],
      }),
      false,
    );
  });

  it("resets the publish review state after applying a rewrite", () => {
    assert.equal(getReviewStateAfterApplyingRewrite(), "ready");
  });
});
