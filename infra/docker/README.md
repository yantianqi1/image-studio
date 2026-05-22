# Docker 运行说明

根目录只保留一套正式 Compose：

- `docker-compose.yml`：生产态，直接拉取 GHCR 镜像运行

这套配置适合：

- 服务器通过 Docker Compose 镜像部署
- 每次推送 `main` 后拉取 GHCR 最新镜像
- 用持久化卷保存 PostgreSQL 数据和生成资产

## 服务清单

- `postgres`：数据库
- `api`：FastAPI
- `worker`：任务进程
- `public-web`：用户端 Next.js
- `admin-web`：后台端 Next.js
- `nginx`：统一入口

## 启动前准备

复制唯一环境变量模板：

```bash
cp .env.example .env
```

至少确认以下变量已经设置：

- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_PASSWORD`
- `SESSION_SECRET`
- `POSTGRES_PASSWORD`
- `GHCR_OWNER`

## 启动

拉取镜像：

```bash
docker compose pull
```

后台启动：

```bash
docker compose up -d
```

查看状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f postgres api worker public-web admin-web nginx
```

停止：

```bash
docker compose down
```

清空卷并重置数据库：

```bash
docker compose down -v
```

## 入口说明

`docker-compose.yml` 只对外暴露：

- `7700`：用户端 nginx 入口
- `7701`：管理后台 nginx 入口

以下端口只在 Docker 网络内部使用，不对宿主机发布：

- `public-web:7700`
- `admin-web:7701`
- `api:7800`
- `postgres:5432`

## 生产镜像部署

GitHub Actions 会在推送 `main` 或 `v*.*.*` tag 后构建并推送：

- `ghcr.io/yantianqi1/image-studio-api`
- `ghcr.io/yantianqi1/image-studio-worker`
- `ghcr.io/yantianqi1/image-studio-public-web`
- `ghcr.io/yantianqi1/image-studio-admin-web`
- `ghcr.io/yantianqi1/image-studio-worker-go`
- `ghcr.io/yantianqi1/image-studio-image-api-go`

`image-api-go` 和 `worker-go` 与其他服务一样由 `.github/workflows/build-ghcr-images.yml` 统一构建并推送，`docker-compose.yml` 直接按镜像名拉取。

服务器启动：

```bash
docker login ghcr.io
docker compose pull
docker compose up -d
```

后续更新：

```bash
./scripts/deploy-prod.sh
```

生产状态检查：

```bash
docker compose ps
docker compose logs -f api worker
curl -i http://localhost:7700/health
```

## generated-assets 卷

Compose 中声明了独立卷：

- `generated_assets_data`

挂载位置：

- `api`：`/app/generated-assets`
- `worker`：`/app/generated-assets`

目的：

- worker 写入生成结果
- API 读取同一份文件并通过 `/api/public/image/assets/{id}` 返回

如果两边不挂同一份卷，就会出现数据库里有记录但 API 找不到物理文件的问题。

## 生产注意事项

- `.env.example` 是唯一模板，不提交真实 `.env`
- `SESSION_SECRET`、`POSTGRES_PASSWORD`、`DEFAULT_ADMIN_PASSWORD` 必须在服务器替换
- GHCR package 如果是 private，服务器需要用有 `read:packages` 权限的 token 登录
- `generated_assets_data` 和 `postgres_data` 是持久化卷，重建容器不会清空数据
