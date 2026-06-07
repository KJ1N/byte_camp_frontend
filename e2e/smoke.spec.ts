import { expect, test } from "@playwright/test";

const demoUser = {
  email: "demo@bytecamp.local",
  password: "bytecamp123",
};

test("creator can generate, save, review, publish, and read an article", async ({ page }) => {
  const topic = `E2E smoke AI 内容创作 ${Date.now()}`;

  await page.goto("/login");
  await page.getByLabel("邮箱").fill(demoUser.email);
  await page.getByRole("textbox", { name: "密码" }).fill(demoUser.password);
  await page.getByRole("button", { name: "登录并进入" }).click();
  await expect(page.getByText("训练营创作者").first()).toBeVisible();

  await page.goto("/workspace");
  await page.getByLabel("创作主题").fill(topic);
  await page.getByLabel("目标受众").fill("内容创作者");
  await page.getByRole("button", { name: "AI 生成初稿" }).click();
  await expect(page.getByPlaceholder("请输入文章标题")).not.toHaveValue("", { timeout: 20_000 });
  await expect(page.getByText("生成大纲").last()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/drafts\/[^/]+$/);
  await expect(page.getByPlaceholder("请输入文章标题（2～30个字）")).not.toHaveValue("");
  await expect(page.getByText("草稿已保存")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "发布" }).click();
  await expect(page).toHaveURL(/\/publish\/[^/]+$/);
  await page.getByRole("button", { name: "开始审核" }).click();
  await expect(page.getByText("未发现明显风险。")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("质量评分", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "确认发布" }).click();
  await expect(page).toHaveURL(/\/articles\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI");
  await expect(page.getByText("分发反馈")).toBeVisible();
});
