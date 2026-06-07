# Assets Cloud Vision Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cloud/CDN-backed asset upload flow with image vision audit, editor insertion, creator stat verification, and beginner learning documentation.

**Architecture:** `apps/api` owns asset validation, image audit decisions, cloud storage calls, ownership checks, and persistence. `apps/web` owns upload UI, asset list state, and inserting approved image CDN URLs into TipTap. `packages/shared` carries asset DTOs and enums.

**Tech Stack:** NestJS, Prisma, Node `Buffer`, OpenAI-compatible gateway patterns, Next.js, React, TipTap, TypeScript, `node:test`.

---

### Task 1: Shared Asset Contract

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] Add `AssetKind`, `AssetAuditStatus`, `AssetAuditResult`, `AssetSummary`, `UploadAssetResponse`, `ListAssetsResponse`, and `DeleteAssetResponse`.
- [ ] Run API/Web tests that import shared types through downstream tasks.

### Task 2: Backend Asset Services

**Files:**
- Create: `apps/api/src/assets/assets.service.spec.ts`
- Create: `apps/api/src/assets/asset-audit.service.ts`
- Create: `apps/api/src/assets/cloud-storage.service.ts`
- Create: `apps/api/src/assets/assets.service.ts`
- Create: `apps/api/src/assets/assets.controller.ts`
- Modify: `apps/api/src/assets/assets.module.ts`

- [ ] Write failing tests for legal image upload, legal document upload, WARN audit, BLOCK audit, unsupported MIME, oversized file, owner-scoped listing, and delete ownership.
- [ ] Run `corepack pnpm --filter @bytecamp-aigc/api test -- src/assets/assets.service.spec.ts` and verify failure.
- [ ] Implement mock/cloud storage abstraction, visual audit abstraction, asset service, controller, and module wiring.
- [ ] Re-run the backend asset tests and make them pass.

### Task 3: Creator Stats

**Files:**
- Modify: `apps/api/src/users/users.service.spec.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/web/src/app/creator/page.tsx`

- [ ] Add or adjust tests proving withdrawn articles do not count as published works, while real engagement totals still aggregate.
- [ ] Update implementation only if tests reveal a gap.
- [ ] Update creator page follower hint to avoid implying real follower data exists.

### Task 4: Frontend Asset Helpers and API Upload

**Files:**
- Create: `apps/web/src/lib/assets.ts`
- Create: `apps/web/src/lib/assets.test.ts`
- Modify: `apps/web/src/lib/api.ts`

- [ ] Write failing helper tests for MIME classification, size formatting, upload disabled state, audit labels, and insert eligibility.
- [ ] Run web helper tests and verify failure.
- [ ] Implement helper functions and FormData-safe `apiFetch`.
- [ ] Re-run web tests and make them pass.

### Task 5: Editor Asset UI

**Files:**
- Create: `apps/web/src/components/asset-panel.tsx`
- Modify: `apps/web/src/components/editor/rich-text-editor.tsx`
- Modify: `apps/web/src/app/drafts/[id]/page.tsx`

- [ ] Add an imperative/editor prop path for inserting approved image assets.
- [ ] Add a right-panel tab for assets with upload, audit state, list, copy, delete, and multimodal placeholder.
- [ ] Keep existing AI assistant and content suggestion flows intact.

### Task 6: Docs and Verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/learn/016-assets-cloud-vision-audit-learning.md`

- [ ] Add cloud/CDN/audit env vars.
- [ ] Update README item statuses accurately, leaving user profile unchecked/deferred.
- [ ] Write beginner learning document.
- [ ] Run `corepack pnpm typecheck`, API tests, web tests, and web build. Do not run `corepack pnpm test:e2e:smoke`.
