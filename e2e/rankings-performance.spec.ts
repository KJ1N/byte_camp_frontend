import { expect, test, type Page } from "@playwright/test";

const lcpThresholdMs = Number.parseInt(process.env.RANKINGS_LCP_THRESHOLD_MS ?? "2500", 10);

type RankingTab = "hot" | "top";

async function installLcpObserver(page: Page) {
  await page.addInitScript(() => {
    const target = window as Window & { __rankingLcp?: number };
    target.__rankingLcp = 0;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          target.__rankingLcp = lastEntry.startTime;
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      target.__rankingLcp = 0;
    }
  });
}

async function readLcp(page: Page) {
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    return ((window as Window & { __rankingLcp?: number }).__rankingLcp ?? 0);
  });
}

async function expectRankingPagePerformance(page: Page, tab: RankingTab) {
  await installLcpObserver(page);
  await page.goto(`/rankings?tab=${tab}`);
  await expect(page.getByRole("heading", { name: tab === "hot" ? "热点榜" : "爆文榜" })).toBeVisible();

  const rows = page.getByTestId("ranking-row");
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(10);

  const lcp = await readLcp(page);
  console.log(`${tab} ranking LCP: ${Math.round(lcp)}ms`);
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThanOrEqual(lcpThresholdMs);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => rows.count(), { timeout: 10_000 }).toBeGreaterThan(10);
}

test("rankings page renders the first page quickly and infinite-scrolls hot ranking", async ({ page }) => {
  await expectRankingPagePerformance(page, "hot");
});

test("rankings page renders the first page quickly and infinite-scrolls top ranking", async ({ page }) => {
  await expectRankingPagePerformance(page, "top");
});
