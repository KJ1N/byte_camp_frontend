# Draft Offline Sync And Redis Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build browser-side draft offline recovery/sync and Redis Sorted Set ranking cache with PostgreSQL fallback.

**Architecture:** The web app keeps offline draft snapshots in localStorage and replays them through the existing draft PATCH API. The API keeps PostgreSQL as the source of truth and uses Redis only as an optional ranking cache for hot/top lists.

**Tech Stack:** Next.js, React, TypeScript, NestJS, Prisma, ioredis, Node test runner.

---

## File Structure

- `apps/web/src/lib/draft-offline-state.ts`: browser-local draft snapshot types and pure helpers.
- `apps/web/src/lib/draft-offline-state.test.ts`: TDD coverage for snapshot metadata, conflict checks, and compatibility.
- `apps/web/src/app/drafts/[id]/page.tsx`: network listeners, pending snapshot restore/sync UI, and publish gating.
- `apps/api/src/ranking/ranking-cache.service.ts`: optional Redis Sorted Set wrapper.
- `apps/api/src/ranking/ranking-cache.service.spec.ts`: fake Redis coverage for cache read/write/fallback behavior.
- `apps/api/src/ranking/ranking.module.ts`: exports cache service.
- `apps/api/src/feed/feed.service.ts`: Redis-first ranking reads with PostgreSQL fallback/writeback.
- `apps/api/src/feed/feed.service.spec.ts`: cache hit/miss/error ranking coverage.
- `apps/api/src/publish/publish.service.ts`: invalidate/remove ranking cache after publish/withdraw.
- `apps/api/src/analytics/analytics.service.ts`: invalidate ranking cache after engagement events.
- `.env.example`, `README.md`, `docs/learn/015-draft-offline-sync-and-redis-ranking-learning.md`: docs and learning recap.

## Tasks

### Task 1: Draft Offline Helpers

- [ ] Write failing tests in `apps/web/src/lib/draft-offline-state.test.ts` for new metadata, legacy compatibility, conflict detection, and summary helpers.
- [ ] Run `pnpm --filter @bytecamp-aigc/web test -- draft-offline-state`.
- [ ] Implement `DraftOfflineSaveReason`, metadata-aware `createDraftOfflineState`, `isDraftOfflineConflict`, `getDraftOfflineStatusText`, and legacy normalization.
- [ ] Re-run the web helper test.

### Task 2: Draft Editor Sync UI

- [ ] Update `apps/web/src/app/drafts/[id]/page.tsx` to use the new helper API, browser online/offline events, sync state, retry, discard, and conflict handling.
- [ ] Keep publish disabled when a local snapshot exists, sync is running, or conflict is unresolved.
- [ ] Run `pnpm --filter @bytecamp-aigc/web test` and `pnpm --filter @bytecamp-aigc/web typecheck`.

### Task 3: Ranking Cache Service

- [ ] Write failing tests in `apps/api/src/ranking/ranking-cache.service.spec.ts` for disabled cache, sorted-set write/read, invalidation, removal, and command failures.
- [ ] Run `pnpm --filter @bytecamp-aigc/api test -- ranking-cache`.
- [ ] Implement `RankingCacheService` with optional ioredis client and test-friendly injected client.
- [ ] Re-run the ranking cache test.

### Task 4: Feed Redis Fallback

- [ ] Extend `apps/api/src/feed/feed.service.spec.ts` for Redis hit, miss/writeback, and error fallback.
- [ ] Run `pnpm --filter @bytecamp-aigc/api test -- feed.service`.
- [ ] Inject `RankingCacheService` into `FeedService`, read cached ids first, write fallback rankings back, and preserve PostgreSQL status filtering.
- [ ] Re-run feed tests.

### Task 5: Cache Invalidation

- [ ] Extend publish and analytics service tests to verify cache invalidation/removal after publish, withdraw, and engagement writes.
- [ ] Implement minimal invalidation calls in `PublishService` and `AnalyticsService`.
- [ ] Re-run API tests.

### Task 6: Docs And Verification

- [ ] Update `.env.example` and README checklist.
- [ ] Add `docs/learn/015-draft-offline-sync-and-redis-ranking-learning.md`.
- [ ] Run `pnpm typecheck`, `pnpm --filter @bytecamp-aigc/web build`, and `pnpm --filter @bytecamp-aigc/api build`.
