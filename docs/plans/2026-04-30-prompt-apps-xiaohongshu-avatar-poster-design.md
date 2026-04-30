# 小红书头像出逃海报设计

## 目标

新增一个公开 prompt 小应用：用户上传一张小红书个人主页截图，生成“头像拟人化视觉海报”。页面只暴露上传控件、全身卡通人物备注和图片模型选择；完整提示词隐藏在 prompt builder 中。

## 非目标

- 不新增后端 API。
- 不绕过真实上传和真实 `/image/jobs` 流程。
- 不在页面源码或目录 registry 中保存长提示词正文。

## 路由与目录

- 路由：`/apps/xiaohongshu-avatar-poster`
- 标题：`小红书头像出逃海报`
- Slug：`xiaohongshu-avatar-poster`
- 模式：`edit`
- 数量：`requested_count: 1`

## 表单字段

- 小红书主页截图：必填，走 `publicApi.uploadImageAsset(file)`。
- 全身卡通人物备注：可选，用于修改“全身卡通人物”的形象设定；留空时默认延续头像风格。
- 模型：沿用公开图片模型列表。

## 数据流

1. 用户上传图片，前端只接受 `image/*`，上传失败显示明确错误。
2. 上传成功后保存 `{ assetId, assetUrl, mimeType }`。
3. 提交时由 state helper 生成请求：
   - `mode: "edit"`
   - `source_asset_id: assetId`
   - `prompt: buildXiaohongshuAvatarPosterPrompt({ characterNote })`
4. 使用 `publicApi.generateImage()` 创建图片任务，并沿用现有轮询和结果面板。

## 错误处理

- 未上传截图时禁用提交。
- 上传非图片文件时显示“请上传图片文件。”。
- 上传、创建任务、轮询失败时显示原始 `Error.message`，否则显示“创建任务失败”。

## 测试

- catalog metadata、封面资产和 prompt builder。
- state helper 的提交条件、`edit` 请求形状和错误文案。
- 页面源码检查：路由存在、上传必填、长提示词不出现在 React 页面中。
- 完整验证：`pnpm --filter public-web test`、`typecheck`、`lint`、7700 smoke check。
