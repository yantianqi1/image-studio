# 韩系偶像九宫格小应用设计

## 目标

- 新增公开路由 `/apps/korean-idol-contact-sheet`。
- 用户上传一张参考图，系统以该图人物身份为唯一参考，生成 9:16 竖版 3x3 写真拼图。
- 提交图片任务时使用现有 `/image/uploads` 和 `/image/jobs`，请求为 `mode: "edit"` 并携带 `source_asset_id`。
- UI 不展示完整内置提示词，只暴露参考图、备注和模型选择。

## 非目标

- 不修改后端 API。
- 不新增生成成功的 mock 或前端假结果。
- 不支持无参考图的纯文生图降级。

## 字段

- 参考图：必填，上传成功后保存 `assetId / assetUrl / mimeType`。
- 备注：选填，用于补充情绪、姿态、服装细节或画面偏好。
- 模型：必填，复用公开图片模型列表。

## 数据流

1. 用户选择图片。
2. 前端调用 `publicApi.uploadImageAsset(file)`。
3. 上传成功后保存源图信息；失败时展示显式错误并禁止提交。
4. 用户提交表单。
5. 前端构造固定提示词、`model_code`、`requested_count: 1`、`mode: "edit"`、`source_asset_id`。
6. 前端调用 `publicApi.generateImage()` 并轮询结果。

## 测试

- catalog 元数据、封面资源和提示词构建器。
- state helper 的提交条件与 `edit/source_asset_id` 请求。
- 页面路由、上传入口、完整提示词隐藏。
