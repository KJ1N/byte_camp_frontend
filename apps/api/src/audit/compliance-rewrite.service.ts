import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditDecision,
  richTextToPlainText,
  type AiStreamEvent,
  type AuditResult,
  type ComplianceRewriteInput,
  type RichTextDocument,
} from "@bytecamp-aigc/shared";
import { AiGatewayService } from "../ai-gateway/ai-gateway.service";
import { PrismaService } from "../prisma/prisma.service";

interface DraftRecord {
  id: string;
  title: string;
  body: unknown;
}

interface AuditRecord {
  id: string;
  decision: AuditDecision | string;
  rawResult: unknown;
}

@Injectable()
export class ComplianceRewriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGatewayService: AiGatewayService,
  ) {}

  async *streamComplianceRewrite(userId: string, input: ComplianceRewriteInput): AsyncGenerator<AiStreamEvent> {
    const draftId = input.draftId?.trim();
    if (!draftId) throw new BadRequestException("Draft id is required");

    const draft = (await this.prisma.draft.findFirst({
      where: { id: draftId, authorId: userId },
    })) as DraftRecord | null;

    if (!draft) throw new NotFoundException("Draft not found");

    const auditRecord = await this.loadAuditRecord(draft.id, input.auditRecordId);
    const audit = auditRecord.rawResult as AuditResult;

    if (auditRecord.decision === AuditDecision.Pass || audit.decision === AuditDecision.Pass) {
      throw new BadRequestException("Passed audit does not need compliance rewrite");
    }

    for await (const event of this.aiGatewayService.streamComplianceRewrite({
      title: draft.title,
      bodyText: richTextToPlainText(draft.body as RichTextDocument),
      audit,
    })) {
      if (event.event !== "done") {
        yield event;
        continue;
      }

      yield {
        event: "done",
        data: {
          ...event.data,
          draftId: draft.id,
          auditRecordId: auditRecord.id,
        },
      };
    }
  }

  private async loadAuditRecord(draftId: string, auditRecordId?: string): Promise<AuditRecord> {
    const auditRecord = (await this.prisma.auditRecord.findFirst({
      where: {
        draftId,
        ...(auditRecordId ? { id: auditRecordId } : {}),
      },
      orderBy: { createdAt: "desc" },
    })) as AuditRecord | null;

    if (!auditRecord) {
      if (auditRecordId) throw new NotFoundException("Audit record not found");
      throw new BadRequestException("Run audit before compliance rewrite");
    }

    return auditRecord;
  }
}
