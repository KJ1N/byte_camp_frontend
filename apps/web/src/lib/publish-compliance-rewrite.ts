import { AuditDecision, type ComplianceRewriteDoneData } from "@bytecamp-aigc/shared";

export type ComplianceRewriteState = "idle" | "streaming" | "ready" | "applying" | "applied" | "error";

export function canStartComplianceRewrite(decision: AuditDecision | undefined) {
  return decision === AuditDecision.Warn || decision === AuditDecision.Block;
}

export function isComplianceRewriteDoneData(value: unknown): value is ComplianceRewriteDoneData {
  if (!value || typeof value !== "object") return false;

  const record = value as Partial<ComplianceRewriteDoneData>;

  return (
    typeof record.draftId === "string" &&
    typeof record.auditRecordId === "string" &&
    typeof record.bodyText === "string" &&
    Boolean(record.body && typeof record.body === "object" && record.body.type === "doc" && Array.isArray(record.body.content)) &&
    Array.isArray(record.suggestions)
  );
}

export function isRewriteApplyDisabled(state: ComplianceRewriteState, payload: ComplianceRewriteDoneData | null) {
  return state !== "ready" || !isComplianceRewriteDoneData(payload);
}

export function getReviewStateAfterApplyingRewrite() {
  return "ready" as const;
}
