# Migrations

当前仓库已经接入 Alembic，数据库结构由版本化迁移管理。

## 基线版本

- 当前基线：`20260424_000001`
- 配置文件：`alembic.ini`
- 迁移目录：`apps/api/alembic`
- 版本目录：`apps/api/alembic/versions`

## 常用命令

升级到最新版本：

```bash
alembic -c alembic.ini upgrade head
```

查看当前版本：

```bash
alembic -c alembic.ini current
```

查看迁移历史：

```bash
alembic -c alembic.ini history
```

## 运行时行为

API 与 worker 启动时都会调用 `initialize_database()`。

该函数的顺序是：

1. 导入所有领域模型
2. 执行 `alembic upgrade head`

运行时不再保留 `create_all`、runtime patch 或 `stamp head` 的兼容分支。

## 当前域模型范围

按现有模型文件，数据库对象主要覆盖：

1. `auth`
2. `billing`
3. `redeem`
4. `llm`
5. `image`
6. `comic`
7. `settings`

## 生产发布顺序

生产环境建议遵守以下顺序：

1. 备份数据库
2. 在预发环境运行 `alembic -c alembic.ini upgrade head`
3. 运行 API 测试与 worker 单次消费验证
4. 在生产环境执行同一迁移命令
5. 启动 API
6. 启动 worker
7. 验证核心接口、后台登录、图片任务和资产读取

## 建议检查项

连接数据库后，至少确认以下对象存在：

- `admin_users`
- `admin_sessions`
- `users`
- `user_sessions`
- `wallets`
- `wallet_ledger`
- `wallet_reservations`
- `providers`
- `sellable_models`
- `image_jobs`
- `image_job_results`
- `assets`
- `comic_projects`
- `comic_tasks`
- `site_settings`
- `alembic_version`

## PostgreSQL 快速验证

```bash
docker compose exec postgres psql -U postgres -d commercial_studio -c '\dt'
docker compose exec postgres psql -U postgres -d commercial_studio -c 'select * from alembic_version;'
```

如果是本机数据库：

```bash
psql postgresql://postgres:postgres@localhost:5432/commercial_studio -c '\dt'
psql postgresql://postgres:postgres@localhost:5432/commercial_studio -c 'select * from alembic_version;'
```
