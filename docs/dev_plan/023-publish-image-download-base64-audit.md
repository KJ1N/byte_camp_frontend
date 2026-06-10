# 发布图片下载转 Base64 审核技术方案

## 1. 功能目标和用户价值

当前发布前审核会把草稿图片节点中的 `src` URL 直接交给视觉模型。该方式依赖模型能够访问图片地址，本地 API 地址、需要重定向的素材地址或临时签名地址都可能导致审核不稳定。

本次调整后的链路为：

```text
草稿图片节点
  -> 后端提取图片 URL
  -> 后端受限下载图片
  -> 校验协议、重定向、超时、MIME 和大小
  -> 转为 data:{mimeType};base64,...
  -> 复用素材上传时的视觉审核请求
  -> 解析结构化审核结果
  -> 汇总文字和图片审核结果
```

用户价值：

- 发布审核不再要求视觉模型主动访问本地或对象存储 URL。
- 上传素材审核和发布图片复审使用相同的图片数据形式，结果更稳定。
- 模型返回字段类型不符合约定时不再抛出原始 JavaScript 类型错误。
- 图片下载或模型异常仍会阻止直接发布，但页面只展示可理解的业务提示。

## 2. 涉及模块

### 前端

- `apps/web` 不改接口和页面结构。
- 发布确认页继续调用 `/audit/check`、`/scoring/article` 和 `/publish/:draftId`。

### 后端

- `apps/api/src/assets/asset-audit.service.ts`
  - 发布图片 URL 下载。
  - 下载安全限制。
  - MIME 和文件大小校验。
  - 下载结果转 Base64。
  - 复用视觉模型请求。
  - 审核响应运行时校验。
- `apps/api/src/publish/publish.service.ts`
  - 保留单图失败转 `WARN` 的失败关闭策略。
  - 不再把内部异常原文返回给前端。
  - 服务端记录具体异常，前端返回稳定提示。
- 对应测试文件补充下载、Base64、异常响应和友好提示覆盖。

### 共享包

- `packages/shared` 不新增接口或类型。

## 3. 新增或修改文件

- 新增 `docs/dev_plan/023-publish-image-download-base64-audit.md`
- 修改 `apps/api/src/assets/asset-audit.service.ts`
- 修改 `apps/api/src/assets/asset-audit.service.spec.ts`
- 修改 `apps/api/src/publish/publish.service.ts`
- 修改 `apps/api/src/publish/publish.service.spec.ts`
- 新增 `docs/learn/023-publish-image-download-base64-audit-learning.md`

## 4. 数据模型和 API 变更

- Prisma schema 不变。
- HTTP API 路径和请求体不变。
- `AuditResult` 和 `AssetAuditResult` 契约不变。
- 发布前图片审核的内部输入从远程 URL 改为下载后的 `Buffer + mimeType`。

## 5. 后端处理设计

### 图片下载

- 只接受 `http` 和 `https`。
- 默认最多跟随 5 次重定向，每次重新校验目标 URL。
- 允许访问公开 URL。
- `localhost`、回环地址和私网字面量默认拒绝；与 `NEXT_PUBLIC_API_BASE_URL` 同源的本项目 API 地址允许访问，以支持本地素材 `/assets/:id/view`。
- 下载设置 10 秒超时。
- 通过 `Content-Length` 提前拒绝超过 5MB 的响应。
- 流式读取响应并再次执行 5MB 限制，避免服务端缺少或伪造 `Content-Length`。
- 仅接受 PNG、JPEG、WebP 和 GIF，并通过文件头识别真实 MIME。

### 视觉审核

- 素材上传和发布复审都调用同一个 Base64 视觉审核请求方法。
- 请求中的图片格式统一为：

```json
{
  "type": "image_url",
  "image_url": {
    "url": "data:image/png;base64,..."
  }
}
```

- 发布复审仍附带图片 `alt`、caption 和 prompt 上下文。
- Prompt 明确 `categories` 和 `evidence` 必须是数组，并列出合法风险枚举。

### 模型响应解析

- `categories` 支持标准数组；模型偶发返回单个字符串时按单元素处理。
- 未知风险类别被过滤，不调用不安全的 `.filter()`。
- `evidence` 非数组时按空数组处理；数组元素逐项校验。
- 无效 JSON 或无效裁决继续作为模型输出异常处理。

### 异常策略

- 单图下载、类型校验或模型审核失败时，保持失败关闭：
  - 图片结果转换为 `WARN`。
  - 发布被要求修改后重审。
- 服务端日志保留真实异常。
- 返回前端的证据说明统一为“图片下载或视觉审核失败，请稍后重试或替换图片”，不暴露堆栈和 JavaScript 内部错误。

## 6. 前端交互和页面状态

- 页面状态不变。
- 正常图片审核通过时显示 `PASS`。
- 图片不可下载、超时、超过限制、格式不支持或模型输出异常时显示 `WARN`。
- 用户可以重试审核、替换图片或移除图片。

## 7. 风险、边界情况和回滚

| 风险或边界 | 处理 |
| --- | --- |
| 图片 URL 指向本机或私网服务 | 默认拒绝，仅放行配置中的本项目 API 同源地址 |
| URL 重定向到不安全地址 | 每次重定向重新校验，最多 5 次 |
| 超大图片耗尽内存 | `Content-Length` 和流式累计双重限制为 5MB |
| 响应头伪造图片类型 | 使用文件头识别 MIME |
| CDN 或对象存储临时不可用 | 该图片转 `WARN`，不绕过审核 |
| 模型字段类型漂移 | 运行时解析和归一化，不直接信任 TypeScript 断言 |
| Base64 请求体变大 | 5MB 原图约增加到 6.7MB，请求仍受原素材上限约束 |

回滚方式：

- 可回退 `auditGeneratedImage` 到 URL 直传模型。
- 不涉及数据库迁移、API 契约和前端改动，回滚不会影响已有草稿和素材。

## 8. 验证和测试计划

- 单元测试：
  - 发布图片先下载，再以 Base64 data URL 发送给模型。
  - 跟随本项目素材查看地址重定向。
  - 拒绝非图片响应、超过 5MB、超时和过多重定向。
  - `categories` 为字符串时不再出现 `.filter is not a function`。
  - `evidence` 非数组时安全降级。
  - 发布服务捕获图片异常后返回友好 `WARN`。
- 命令验证：
  - API 相关单元测试。
  - `pnpm typecheck`。
  - 必要时运行 API build。

