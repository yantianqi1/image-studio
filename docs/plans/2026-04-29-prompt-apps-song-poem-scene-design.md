# 诗词双境图 Prompt App Design

## Goals

- 新增公开小应用「诗词双境图」。
- 将用户提供的中国古典诗意场景提示词封装为隐藏模板。
- 暴露「对应诗词」为用户可自定义输入，并保留可选备注用于画面微调。
- 通过现有 public image job API 创建 `generate` 图片任务。

## Non-goals

- 不新增后端接口、上传流程或图片编辑模式。
- 不在 React 页面或应用目录卡片中暴露完整长提示词。
- 不增加假进度、mock 成功或静默降级路径。

## Route And Fields

- Route: `/apps/song-poem-scene`
- Title: `诗词双境图`
- Slug: `song-poem-scene`
- Required field: `对应诗词`
- Optional field: `备注`
- Mode: `generate`
- Count: `requested_count: 1`

## Data Flow

1. 用户填写小诗、备注和图片模型。
2. state helper 调用 prompt builder 生成完整提示词。
3. 页面通过 `publicApi.generateImage()` 提交任务。
4. 复用现有轮询逻辑等待结果并展示图片。
5. API 或轮询错误直接进入显式错误状态。

## Tests

- catalog metadata and cover asset.
- prompt builder inserts and trims `对应诗词`, and omits empty note wrapper.
- state helper validates poem/model and builds generate request.
- page route wires the app component.
- page source must not contain long fixed prompt phrases; those phrases must live in the prompt builder module.
