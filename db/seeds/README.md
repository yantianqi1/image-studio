# Seeds

当前仓库没有单独的 seed 命令入口，但已经存在两类“启动时初始化”行为。

## 1. 默认管理员

API 启动时会读取：

- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_PASSWORD`

初始化规则：

- 两个变量任一为空：跳过
- 两者都有值：若同名管理员不存在，则创建
- 已存在同名管理员：直接复用，不重复创建

推荐首启步骤：

1. 在 `.env` 中填写默认管理员账号
2. 启动 API
3. 调用后台登录接口验证
4. 首次登录成功后，按运营要求尽快更换密码

验证命令：

```bash
curl -i -X POST http://localhost:7800/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"change-me"}'
```

## 2. 默认 Provider 与模型目录

图片与 Provider 相关逻辑在读取公共模型或 Provider 列表时，会确保存在一组本地开发默认值：

- Provider：`local-dev`
- 模型编码：`local-dev-image`

这组数据的作用是：

- 让图片任务在本地开发时可直接走通
- 避免前台“模型列表”完全为空

它不是完整生产 seed，只是最小开发初始化。

## 当前没有的 seed

以下内容目前没有独立种子脚本：

- 站点设置预置模板
- 兑换码批量初始化
- 钱包预置余额
- 生产用 LLM Provider 凭据

如果需要这些数据，应该明确增加真正的 seed 流程，而不是在文档里伪造不存在的命令。

## 生产初始化草案

生产环境首次部署建议按以下顺序：

1. 设置 `DEFAULT_ADMIN_USERNAME` 与高强度 `DEFAULT_ADMIN_PASSWORD`
2. 启动 `api` 完成建表与默认管理员初始化
3. 用后台账号登录验证
4. 打开用户端模型列表，确认默认目录存在
5. 再启动 `worker`，验证图片任务链路

## generated-assets 与 seed 的关系

`generated-assets` 不属于 seed 数据。

它是运行期产物目录，用来存放 worker 生成的图片文件。不要把它和：

- 初始管理员
- 初始模型目录
- 预置站点配置

混为一类。
