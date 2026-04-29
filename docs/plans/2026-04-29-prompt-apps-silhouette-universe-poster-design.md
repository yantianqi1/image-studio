# 轮廓宇宙海报 Prompt App Design

## Goals

- 新增公开小应用 `轮廓宇宙海报`，路由为 `/apps/silhouette-universe-poster`。
- 只暴露 `主题` 必填字段与 `备注` 可选字段。
- 使用现有公开图片任务 API 创建单张纯生成图片任务。
- 完整预设提示词只保存在 prompt builder，不出现在 React 页面源码中。

## Non-goals

- 不新增后端接口、上传流程或图片编辑模式。
- 不引入模拟生成结果、静默 fallback 或端口切换。
- 不改变现有 prompt app 的提交与轮询机制。

## Data Flow

1. 页面读取公开模型列表并筛选图片模型。
2. 用户输入主题、可选备注并选择模型。
3. 状态 helper 构造 `{ prompt, model_code, requested_count: 1, mode: "generate" }`。
4. 页面调用 `publicApi.generateImage()`，再通过现有 polling 等待结果。
5. 失败信息直接显示在结果面板中。

## Fields

- `topic`: 必填，对应预设 prompt 的 `【主题】`。
- `note`: 可选，用于补充题材倾向、象征方向或画面重点。
- `modelCode`: 图片模型，由公开模型列表解析。

## Tests

- catalog 暴露应用元数据和封面路径。
- prompt builder 插入主题/备注、修剪输入并保留核心风格要求。
- app state 构造固定数量、generate 模式的图片请求。
- 页面源码包含表单入口，但不包含完整长提示词短语。
