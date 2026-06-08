# NewAPI Billing Removal

**状态：已完成**

## 结果

`commercial-studio` 已移除本地 billing / wallet / redeem / pricing 闭环。

当前仓库只保留：

- NewAPI 模型同步
- 模型执行与任务流转
- 资产与观测
- 管理后台的用户、模型、任务和设置

## 已完成的清理

- 后端 billing / redeem 路由已下线
- 注册流程不再创建本地 wallet
- 图片任务不再生成本地 charge / reservation
- 本地 price / variant / default-pricing 代码已删除
- admin-web 的 billing / redeem 页面与入口已删除
- public-web 不再展示本地钱包入口
- 本地 billing / redeem 相关测试已删除或改写
- 本地 wallet / redeem / model_variants schema 已从迁移中移除

## 验证

已按单文件和小组粒度验证后端、前端和 packages 的类型/构建/测试链路。

## 备注

历史设计文档仍会保留“本地计费移除”的过程痕迹，但不再代表当前实现状态。
