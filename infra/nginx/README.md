# Nginx 反向代理草案

前端代码请求的是相对路径：

- 用户端：`/api/public/*`
- 后台端：`/api/admin/*`

因此浏览器访问前端时，必须让同一个 origin 下的 `/api/*` 能转发到 FastAPI。Nginx 的核心职责就是统一入口与代理 API。

## 本地端口

- `public-web`：`http://public-web:7700`
- `admin-web`：`http://admin-web:7701`
- `api`：`http://api:7800`
- `nginx-public`：`http://localhost:8080`
- `nginx-admin`：`http://localhost:8081`

## Docker Compose 内联配置

根目录 `docker-compose.yml` 已经内联一份开发态 nginx 配置，默认规则：

- `8080`：`/api/public/*`、`/health`、`/` 分别转发到 API 与 `public-web`
- `8081`：`/api/admin/*`、`/health`、`/` 分别转发到 API 与 `admin-web`

## 生产域名建议

优先使用独立域名，避免 Next.js 子路径部署时需要额外配置 `basePath`。

推荐：

- `www.example.com` -> `public-web`
- `admin.example.com` -> `admin-web`
- `api.example.com` 可不公开，仅由 nginx 内网访问

如果必须使用同域名子路径，需要先补 `admin-web` 的 Next.js `basePath` 与资源路径适配。当前代码尚未配置，所以生产优先采用独立后台域名。

## 独立域名配置示例

```nginx
server {
  listen 80;
  server_name www.example.com;

  location /api/public/ {
    proxy_pass http://api:7800/api/public/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /health {
    proxy_pass http://api:7800/health;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://public-web:7700;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name admin.example.com;

  location /api/admin/ {
    proxy_pass http://api:7800/api/admin/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /health {
    proxy_pass http://api:7800/health;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://admin-web:7701;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## HTTPS 与 Cookie

当前 API 设置 Cookie 时使用：

- `httponly=True`
- `samesite="lax"`

生产启用 HTTPS 后，需要统一检查：

- 站点域名是否和 Cookie 作用域一致
- 是否需要显式设置 `secure=True`
- 是否需要拆分用户端和后台端 Cookie 域

这些行为属于认证策略变更，不能在 nginx 草案里静默兜底。

## 验证命令

Nginx 容器内检查配置：

```bash
docker compose exec nginx nginx -t
```

健康检查：

```bash
curl -i http://localhost:8080/health
curl -i http://localhost:8081/health
```

用户 API：

```bash
curl -i http://localhost:8080/api/public/models
```

后台登录：

```bash
curl -i -X POST http://localhost:8081/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"change-me"}'
```
