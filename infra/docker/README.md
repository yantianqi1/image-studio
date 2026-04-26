# Docker 运行草案

当前仓库没有独立 `Dockerfile`，因此根目录的 `docker-compose.yml` 采用“官方基础镜像 + 挂载源码 + 容器内执行启动命令”的开发态方案。

这个方案适合：

- 本地快速联调
- CI 前的手工验证
- 在未补齐正式镜像构建链路之前，作为部署草案参考

这个方案不适合：

- 高并发生产环境
- 对镜像体积、启动时间、依赖缓存有严格要求的正式部署

## 服务清单

- `postgres`：数据库
- `api`：FastAPI
- `worker`：任务进程
- `public-web`：用户端 Next.js
- `admin-web`：后台端 Next.js
- `nginx`：统一入口

## 启动前准备

1. 在仓库根目录复制环境变量

```bash
cp .env.example .env
```

2. 至少确认以下变量已经设置

- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_PASSWORD`
- `SESSION_SECRET`

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

## generated-assets 卷

Compose 中声明了独立卷：

- `generated_assets_data`

挂载位置：

- `api`：`/workspace/generated-assets`
- `worker`：`/workspace/generated-assets`

目的：

- worker 写入生成结果
- API 读取同一份文件并通过 `/api/public/image/assets/{id}` 返回

如果两边不挂同一份卷，就会出现数据库里有记录但 API 找不到物理文件的问题。

## 生产化改造建议

正式生产环境建议把当前 compose 草案拆成以下能力：

1. 为 `api`、`worker`、`public-web`、`admin-web` 分别补 `Dockerfile`
2. 在镜像构建阶段固定依赖，而不是容器启动时 `pip install` / `pnpm install`
3. 将 `generated-assets` 映射到持久化磁盘或对象存储桥接层
4. 将 `.env` 改为部署平台注入，不在服务器持久保存明文模板
5. 将 `postgres` 拆为托管数据库或独立数据库实例
6. 使用正式 nginx 配置文件，而不是 compose 内联配置

## 生产部署最小顺序

1. 创建数据库
2. 注入环境变量
3. 启动 `api`
4. 确认默认管理员自动创建完成
5. 启动 `worker`
6. 启动两个前端
7. 配置 nginx
8. 验证图片任务写盘与文件读取
