# Creator Content Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified creator content management view with draft/article status filters, article withdrawal, and edit/republish entry points.

**Architecture:** Shared DTOs define creator content items and withdrawal responses. The API aggregates drafts and articles for the authenticated creator and owns withdrawal permissions/status changes. The web app renders the unified list, filters by status, and calls the withdrawal endpoint.

**Tech Stack:** TypeScript, NestJS, Prisma, Next.js App Router, Tailwind CSS, Node test runner.

---

### Task 1: Shared Types And Web Helpers

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/lib/creator-overview.test.ts`
- Modify: `apps/web/src/lib/creator-overview.ts`

- [ ] **Step 1: Write failing helper tests**

Add tests for filtering creator content by `all`, `draft`, `published`, and `withdrawn`, mapping labels, sorting without mutation, and action availability.

- [ ] **Step 2: Run helper tests and verify RED**

Run: `pnpm --filter @bytecamp-aigc/web test -- creator-overview.test.ts`

Expected: FAIL because `CreatorContentStatus`, `filterCreatorContents`, and action helpers do not exist.

- [ ] **Step 3: Add shared DTOs and helper implementation**

Add creator content enums/interfaces in `packages/shared/src/index.ts`, then implement helpers in `creator-overview.ts`.

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `pnpm --filter @bytecamp-aigc/web test -- creator-overview.test.ts`

Expected: PASS.

### Task 2: Creator Overview Aggregation

**Files:**
- Modify: `apps/api/src/users/users.service.spec.ts`
- Modify: `apps/api/src/users/users.service.ts`

- [ ] **Step 1: Write failing API service tests**

Extend `UsersService` tests to expect `contents` containing drafts, published articles, and withdrawn articles sorted by update time. Verify `publishedArticles` only counts `PUBLISHED`.

- [ ] **Step 2: Run users service tests and verify RED**

Run: `pnpm --filter @bytecamp-aigc/api test -- users.service.spec.ts`

Expected: FAIL because `contents` is missing and withdrawn article mapping is not implemented.

- [ ] **Step 3: Implement content aggregation**

Update `getCreatorOverview` to query all creator articles, map drafts/articles to `CreatorContentItem`, and return `contents` while preserving `recentDrafts` and `works`.

- [ ] **Step 4: Run users service tests and verify GREEN**

Run: `pnpm --filter @bytecamp-aigc/api test -- users.service.spec.ts`

Expected: PASS.

### Task 3: Article Withdrawal Service

**Files:**
- Modify: `apps/api/src/publish/publish.service.spec.ts`
- Modify: `apps/api/src/publish/publish.service.ts`
- Modify: `apps/api/src/publish/publish.controller.ts`

- [ ] **Step 1: Write failing publish service tests**

Add tests for author withdrawal, non-owner 404, repeated withdrawal conflict, public detail hiding withdrawn content, and republishing withdrawn content as `PUBLISHED`.

- [ ] **Step 2: Run publish service tests and verify RED**

Run: `pnpm --filter @bytecamp-aigc/api test -- publish.service.spec.ts`

Expected: FAIL because `withdrawArticle` does not exist and republish does not restore status.

- [ ] **Step 3: Implement withdrawal and route**

Add `withdrawArticle(authorId, articleId)` to `PublishService`, expose `POST /articles/:id/withdraw`, and update existing article publish path to set `status: PUBLISHED`.

- [ ] **Step 4: Run publish service tests and verify GREEN**

Run: `pnpm --filter @bytecamp-aigc/api test -- publish.service.spec.ts`

Expected: PASS.

### Task 4: Creator Page UI

**Files:**
- Modify: `apps/web/src/app/creator/page.tsx`

- [ ] **Step 1: Use existing helper tests as behavioral guard**

No separate component test exists in this project; the behavior is guarded by `creator-overview.test.ts`. Confirm helpers are green before editing the page.

- [ ] **Step 2: Implement unified content list**

Update `/creator` to render "我的内容", filter tabs, per-status actions, withdrawal confirmation, API call, and refresh after success.

- [ ] **Step 3: Run web tests**

Run: `pnpm --filter @bytecamp-aigc/web test`

Expected: PASS.

### Task 5: Docs And Verification

**Files:**
- Modify: `README.md`
- Add: `docs/learn/014-creator-content-management-learning.md`

- [ ] **Step 1: Update README**

Mark the completed creator management items after implementation and tests pass.

- [ ] **Step 2: Add beginner learning document**

Create the learning doc explaining the full page-to-backend-to-database lifecycle.

- [ ] **Step 3: Run final verification**

Run:

```bash
pnpm --filter @bytecamp-aigc/api test
pnpm --filter @bytecamp-aigc/web test
pnpm typecheck
pnpm --filter @bytecamp-aigc/api build
pnpm --filter @bytecamp-aigc/web build
```

Expected: all commands pass, or any environment-specific failure is reported with cause.
