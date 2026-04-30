# 小红书头像出逃海报实施计划

## 目标

在 `apps/public-web` 新增一个基于上传小红书主页截图的 prompt 小应用，提交真实图片编辑任务。

## 架构

长提示词放入 `xiaohongshu-avatar-poster-prompt.ts`。提交条件和请求构建放入 `xiaohongshu-avatar-poster-app-state.ts`。React 页面只负责上传、模型选择、备注输入、提交和结果展示，并复用现有 AppShell、prompt-app 样式与结果面板。

## 步骤

1. 更新 `apps/public-web/tests/prompt-apps.test.mjs`，先覆盖 catalog、封面和 prompt builder。
2. 新增 `apps/public-web/tests/xiaohongshu-avatar-poster-app-state.test.mjs`，先覆盖必传 `source_asset_id` 的 `edit` 请求。
3. 新增 `apps/public-web/tests/xiaohongshu-avatar-poster-page.test.mjs`，先覆盖 route、上传必填文案和长提示词隐藏。
4. 运行窄测试，确认因缺少实现失败。
5. 添加 prompt builder、catalog export、catalog item 和封面资产。
6. 添加 state helper。
7. 添加 React app、上传/表单组件和 route page。
8. 运行窄测试直到通过。
9. 运行 `pnpm --filter public-web test`、`pnpm --filter public-web typecheck`、`pnpm --filter public-web lint`。
10. 检查 7700 端口；如服务已运行则 smoke check `/apps/xiaohongshu-avatar-poster` 和 `/apps`，否则使用 `pnpm dev:public` 启动固定端口后检查。
11. 对新增/修改文件运行 `wc -l`，确认不接近项目文件行数上限。
