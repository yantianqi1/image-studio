# 城市宣传海报小应用设计

## 目标
- 把一段固定的城市新春海报提示词封装成公共 prompt app。
- 只暴露必要变量：`城市` 和 `备注`。
- 保持完整长提示词隐藏在 builder 模块里。

## 非目标
- 不改后端 API。
- 不做上传参考图。
- 不增加多张输出或额外模式。

## 路由
- 页面：`/apps/city-poster`
- 目录：`apps/public-web/src/app/apps/city-poster/page.tsx`

## 字段
- `城市`：必填，作为海报主城市变量。
- `备注`：选填，用于补充地标、气质、宣传方向或本地意象。
- `模型`：沿用现有图片模型选择。

## 数据流
- `prompt-apps.ts` 导出 catalog 和 prompt builder。
- `city-poster-prompt.ts` 组装完整提示词。
- `city-poster-app-state.ts` 组装 `/image/jobs` 请求。
- `city-poster-app.tsx` 负责表单、模型选择、提交、轮询和错误展示。

## 测试
- 校验 catalog 元数据、cover 资源、prompt builder 输出。
- 校验 state helper 的提交条件、请求字段和错误信息。
- 校验 page 只引用 app 组件，不泄露长提示词正文。
