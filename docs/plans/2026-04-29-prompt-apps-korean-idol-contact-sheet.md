# 韩系偶像九宫格小应用实施计划

## 步骤

1. 增加 catalog / prompt builder / cover 相关测试。
2. 增加 app state 测试，覆盖上传图必填和 `mode: "edit"`。
3. 增加页面测试，覆盖路由、上传入口和提示词隐藏。
4. 新增 `korean-idol-contact-sheet-prompt.ts`。
5. 新增 `korean-idol-contact-sheet-app-state.ts`。
6. 新增 React 页面、路由和专用上传样式。
7. 生成 3:4 PNG 封面。
8. 运行窄测、public-web 全量测试、typecheck、lint 和 7700 smoke check。
