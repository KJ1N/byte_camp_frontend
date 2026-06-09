import type { ArticleListItem, CursorPageResponse } from "@bytecamp-aigc/shared";
import { apiBaseUrl, getApiErrorMessage, readApiJson } from "@/lib/api";
import RankingsClient, { type RankingTab } from "./rankings-client";

export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string | string[];
};

type RankingsPageProps = {
  searchParams?: Promise<SearchParams>;
};

const firstPageLimit = 10;

function normalizeTab(value: string | string[] | undefined): RankingTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "top" ? "top" : "hot";
}

async function requestInitialRanking(tab: RankingTab) {
  try {
    const response = await fetch(`${apiBaseUrl()}/rankings/${tab}?limit=${firstPageLimit}`, {
      cache: "no-store",
    });
    const payload = await readApiJson<CursorPageResponse<ArticleListItem> | { message?: string | string[] }>(
      response,
    );

    if (!response.ok || !payload || "message" in payload) {
      return {
        items: [],
        nextCursor: undefined,
        error: getApiErrorMessage(payload, "榜单加载失败，请稍后重试。"),
      };
    }

    const page = payload as CursorPageResponse<ArticleListItem>;

    return {
      items: page.items,
      nextCursor: page.nextCursor,
      error: "",
    };
  } catch {
    return {
      items: [],
      nextCursor: undefined,
      error: "榜单加载失败，请确认 API 服务已启动。",
    };
  }
}

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const params = (await searchParams) ?? {};
  const initialTab = normalizeTab(params.tab);
  const initialPage = await requestInitialRanking(initialTab);

  return (
    <RankingsClient
      initialError={initialPage.error}
      initialItems={initialPage.items}
      initialNextCursor={initialPage.nextCursor}
      initialTab={initialTab}
    />
  );
}
