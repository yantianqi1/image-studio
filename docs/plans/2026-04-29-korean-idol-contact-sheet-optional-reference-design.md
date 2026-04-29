# 韩系偶像九宫格可选参考图设计

## 目标
- 参考图从必填改为可选。
- 有参考图时继续用 `edit + source_asset_id` 保持身份一致。
- 无参考图时用 `generate` 生成原创成年女性偶像九宫格。

## 非目标
- 不改后端 API。
- 不增加 mock、假上传或失败吞没路径。
- 不改变输出数量，仍为 1 张 9:16 九宫格图。

## 数据流
- `korean-idol-contact-sheet-app-state.ts` 根据 `sourceAssetId` 是否存在构造 `edit` 或 `generate` 请求。
- `korean-idol-contact-sheet-prompt.ts` 根据是否有参考图切换参考说明。
- UI 保留上传入口，但文案改为可选参考图。

## 验证
- 单元测试覆盖 submit 条件、generate 请求、edit 请求和提示词分支。
- 页面源码测试确认 UI 不再声明参考图必填。
