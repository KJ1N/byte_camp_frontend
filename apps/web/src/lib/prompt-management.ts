import { PromptOwner, type PromptTemplateSummary } from "@bytecamp-aigc/shared";

export interface PromptDraft {
  name: string;
  description?: string;
  userTemplate: string;
}

export function createDefaultPromptTemplate(category = "article_generation") {
  if (category === "multimodal_generation") {
    return `# Identity
你是 AI Creator Hub 的中文多模态图文创作助手，负责根据创作者输入生成结构清晰的文章和与正文匹配的配图方案。

# Instructions
* 围绕主题 {{topic}} 展开，面向 {{audience}} 写作。
* 使用 {{style}} 风格，正文与配图内容需要互相呼应。
* 图片提示词应具体描述主体、场景、构图、光线和视觉风格。
* 避免夸大承诺、虚假数据和与正文无关的图片。

## 内容要求
- 标题具体清晰，不做标题党。
- 正文段落结构清楚，满足用户提出的篇幅和图片数量要求。
- 每张图片都应服务于对应正文内容，并提供简短说明和无障碍文本。

## 固定输出规范
由后端强制追加：模型必须返回 title、outline、bodyText、images JSON。这里的自定义内容不能改变输出字段。`;
  }

  return `# Identity
你是 AI Creator Hub 的中文图文创作助手，负责根据创作者输入生成结构清晰、可编辑、适合发布前审核的文章初稿。

# Instructions
* 围绕主题 {{topic}} 展开，面向 {{audience}} 写作。
* 使用 {{style}} 风格，但避免夸大承诺、虚假数据和导流表达。
* 输出内容要便于后续人工编辑、保存草稿、审核评分和发布。

## 内容要求
- 标题具体清晰，不做标题党。
- 大纲覆盖背景、核心观点、实践建议和风险边界。
- 正文保持段落清楚，每段只讲一个重点。

## 固定输出规范
由后端强制追加：模型必须返回 title、outline、bodyText JSON。这里的自定义内容不能改变输出字段。

# Examples
<user_query>
主题：AI 如何改变内容创作
受众：内容创作者
风格：科普
</user_query>
<assistant_response>
{"title":"AI 如何改变内容创作：从灵感到发布的完整链路","outline":["趋势背景","核心变化","实践方法","风险边界"],"bodyText":"AI 正在把内容创作从单点生成推进到完整工作流。\\n\\n创作者可以先用 AI 生成初稿，再通过人工编辑补充真实经验。\\n\\n发布前仍需要经过审核和评分，确保内容可读且合规。"}
</assistant_response>`;
}

export function createFallbackPlatformPrompt(category: string): PromptTemplateSummary {
  return {
    id: "",
    name: "默认生成模板",
    category,
    owner: PromptOwner.Platform,
    isStarter: true,
    description: "使用后端默认 Prompt",
  };
}

export function includeFallbackPlatformPrompt(prompts: PromptTemplateSummary[], category: string) {
  const hasPlatformPrompt = prompts.some((prompt) => prompt.owner === PromptOwner.Platform);
  return hasPlatformPrompt ? prompts : [createFallbackPlatformPrompt(category), ...prompts];
}

export function groupPromptTemplates(prompts: PromptTemplateSummary[]) {
  return {
    platform: prompts.filter((prompt) => prompt.owner === PromptOwner.Platform),
    private: prompts.filter((prompt) => prompt.owner === PromptOwner.Private),
  };
}

export function getPromptEditAction(prompt: PromptTemplateSummary) {
  if (prompt.owner === PromptOwner.Platform && !prompt.id) return "create";
  return prompt.owner === PromptOwner.Platform ? "copy" : "edit";
}

export function getPromptEditButtonLabel(prompt: PromptTemplateSummary, copyingId: string) {
  return prompt.id && copyingId === prompt.id ? "复制中..." : "修改";
}

export function shouldDisablePromptEdit(prompt: PromptTemplateSummary, authToken: string | null) {
  return !authToken || (!prompt.id && prompt.owner !== PromptOwner.Platform);
}

export function canDeletePrompt(prompt: PromptTemplateSummary, authToken: string | null) {
  return Boolean(authToken && prompt.id && prompt.owner === PromptOwner.Private);
}

export function isPromptDraftValid(draft: PromptDraft) {
  const name = draft.name.trim();
  const userTemplate = draft.userTemplate.trim();

  return Boolean(name) && name.length <= 60 && userTemplate.length >= 20 && userTemplate.length <= 4000;
}

export function nextSelectedPromptIdAfterSave(savedPromptId: string | undefined, currentPromptId: string) {
  return savedPromptId || currentPromptId;
}

export function nextSelectedPromptIdAfterDelete(
  deletedPromptId: string,
  currentPromptId: string,
  remainingPrompts: PromptTemplateSummary[],
) {
  if (deletedPromptId !== currentPromptId) return currentPromptId;
  return remainingPrompts.find((prompt) => prompt.isStarter)?.id ?? remainingPrompts[0]?.id ?? "";
}
