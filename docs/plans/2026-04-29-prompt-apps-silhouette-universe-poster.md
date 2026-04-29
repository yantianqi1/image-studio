# 轮廓宇宙海报 Prompt App Implementation Plan

## Steps

1. 更新 `prompt-apps.test.mjs`，新增目录与 prompt builder 断言。
2. 新增 `silhouette-universe-poster-app-state.test.mjs` 和页面源码测试。
3. 在 `prompt-apps.ts` 新增应用元数据、输入类型和 hidden prompt builder。
4. 新增 `silhouette-universe-poster-app-state.ts`，固定 `requested_count: 1` 与 `mode: "generate"`。
5. 新增 React 页面和 Next 路由，复用现有 prompt app 工作区与结果面板。
6. 新增应用中心封面资源。
7. 运行窄测后执行 `pnpm --filter public-web test`、`typecheck`、`lint`，再检查 7700 smoke。

## Route

- `/apps/silhouette-universe-poster`

## Verification

- `node --test apps/public-web/tests/prompt-apps.test.mjs apps/public-web/tests/silhouette-universe-poster-app-state.test.mjs apps/public-web/tests/silhouette-universe-poster-page.test.mjs`
- `pnpm --filter public-web test`
- `pnpm --filter public-web typecheck`
- `pnpm --filter public-web lint`
