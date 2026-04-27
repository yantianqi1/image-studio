# Docker 运行说明

根目录保留两套 Compose：

- `docker-compose.yml`：开发态，使用官方基础镜像、挂载源码并在容器内启动服务
- `docker-compose.prod.yml`：生产态，直接拉取 GHCR 镜像运行

开发态方案适合：

- 本地快速联调
- CI 前的手工验证

生产态方案适合：

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

开发态复制环境变量：

```bash
cp .env.example .env
```

生产态复制环境变量：

```bash
cp .env.production.example .env
```

至少确认以下变量已经设置：

- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_PASSWORD`
- `SESSION_SECRET`
- `POSTGRES_PASSWORD`
- `GHCR_OWNER`

## 本地启动

前台启动：

```bash
docker compose up --build
```

后台启动：

```bash
docker compose up --build -d
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

默认暴露端口：

- `8080`：nginx 用户端入口
- `8081`：nginx 后台入口
- `7800`：API 直连
- `7700`：public-web 直连
- `7701`：admin-web 直连
- `5432`：Postgres

推荐访问：

- 用户端：`http://localhost:8080/`
- 后台端：`http://localhost:8081/`
- API 健康检查：`http://localhost:8080/health`

## 生产镜像部署

GitHub Actions 会在推送 `main` 或 `v*.*.*` tag 后构建并推送：

- `ghcr.io/yantianqi1/image-studio-api`
- `ghcr.io/yantianqi1/image-studio-worker`
- `ghcr.io/yantianqi1/image-studio-public-web`
- `ghcr.io/yantianqi1/image-studio-admin-web`

服务器启动：

```bash
docker login ghcr.io
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

后续更新：

```bash
./scripts/deploy-prod.sh
```

生产状态检查：

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api worker
curl -i http://localhost:8080/health
```

## generated-assets 卷

Compose 中声明了独立卷：

- `generated_assets_data`

挂载位置：

- 开发态 `api`：`/workspace/generated-assets`
- 开发态 `worker`：`/workspace/generated-assets`
- 生产态 `api`：`/app/generated-assets`
- 生产态 `worker`：`/app/generated-assets`

目的：

- worker 写入生成结果
- API 读取同一份文件并通过 `/api/public/image/assets/{id}` 返回

如果两边不挂同一份卷，就会出现数据库里有记录但 API 找不到物理文件的问题。

## 生产注意事项

- `.env.production.example` 是模板，不提交真实 `.env`
- `SESSION_SECRET`、`POSTGRES_PASSWORD`、`DEFAULT_ADMIN_PASSWORD` 必须在服务器替换
- GHCR package 如果是 private，服务器需要用有 `read:packages` 权限的 token 登录
- `generated_assets_data` 和 `postgres_data` 是持久化卷，重建容器不会清空数据
