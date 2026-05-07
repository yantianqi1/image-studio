# GCS 资产存储设计

> **目标：** 将图库、上传文件、生成结果和派生缩略图统一迁移到 Google Cloud Storage，保留现有 API 鉴权和前端 URL 结构。

**架构：** 后端新增一个统一的资产存储适配层，业务代码只依赖抽象接口，不直接读写本地路径。生产环境使用 GCS 后端，本地开发和测试保留 local 后端。API 仍然通过现有 `/api/public/image/assets/{id}` 和 `/api/public/image/assets/{id}/thumbnail` 返回文件，前端不直连 bucket。

**技术栈：** FastAPI, SQLAlchemy, Pillow, `google-cloud-storage`

---

## 设计目标

1. 所有图库相关文件都落在云端对象存储，不再依赖共享磁盘卷。
2. 保持现有权限模型不变，继续由 API 统一做鉴权。
3. 不引入静默 fallback、mock 成功或本地云混用的隐式路径。
4. 迁移后，worker、上传接口、图片读取、缩略图生成都走同一套存储抽象。

## 当前问题

现在的实现把 `assets.storage_path` 当成真实文件路径使用：

- 生成结果和上传文件写入 `GENERATED_ASSETS_DIR`
- API 路由直接 `FileResponse(Path(asset.storage_path))`
- provider 调用参考图时直接 `Path(asset.storage_path).read_bytes()`
- 缩略图按本地文件生成
- 删除任务时直接删除本地文件

这意味着图库文件无法脱离本地卷，也无法统一迁移到云端。

## 方案

### 1. 统一资产存储抽象

新增一个资产存储接口，业务代码只调用抽象方法：

- `write_bytes(key, content, mime_type)`
- `read_bytes(key)`
- `open_read(key)`
- `delete(key)`
- `exists(key)`
- `resolve_public_key(asset)`

实现两个 backend：

- `local`：映射到 `GENERATED_ASSETS_DIR`
- `gcs`：映射到配置的 GCS bucket

业务层不再 `new` 具体 SDK，也不直接拼本地路径。

### 2. `storage_path` 语义调整

`assets.storage_path` 继续保留，但语义从“本地绝对路径”改成“统一存储 key”。

示例 key：

- `asset-123.svg`
- `uploads/upload-456.png`
- `comics/<folder>/pages/asset-789.png`

本地 backend 把 key 拼到本地根目录；GCS backend 把 key 拼到 bucket prefix 下。
数据库里不存 `gs://` 绝对 URI，也不暴露 bucket 名称给前端。

### 3. GCS 只做私有对象存储

bucket 保持 private。
API 继续作为唯一读入口：

- 普通用户读自己的图，仍走原有 owner 校验
- 公共图库仍走现有公开权限判断
- 后台仍走 admin 路由

不引入 public ACL，不改成前端直连 bucket，不依赖 signed URL。

## 数据流

### 上传

1. `POST /api/public/image/uploads`
2. 后端读取上传内容
3. 通过存储适配层写入 GCS
4. `assets.storage_path` 保存 key
5. 返回现有 `asset_url`

### 生成结果

1. worker 完成渲染
2. 通过存储适配层写入 GCS
3. 保存 key 到 `assets.storage_path`
4. `image_job_results.asset_url` 继续保留 API URL

### 读取原图

1. 路由验证 owner
2. 通过存储适配层读取对象
3. 返回 `FileResponse` 或等价流式响应

### 缩略图

1. 读取原图 bytes
2. Pillow 生成 JPEG 缩略图
3. 将缩略图作为派生对象写回 GCS
4. 缩略图 key 直接派生自原图 key，例如 `uploads/upload-1.png` -> `uploads/upload-1.thumb.jpg`

### provider 参考图

OpenAI compatible 参考图上传不再依赖本地文件路径，而是通过存储适配层读取 bytes，再交给 `httpx` 的 multipart 请求。

### 删除

删除资产时，原图和派生缩略图都显式删除。对象缺失视为数据不一致，不能静默吞掉。

## 迁移策略

1. 先上线支持双 backend 的代码，但生产仍保持 local 配置。
2. 执行一次显式迁移脚本，把现有 `generated-assets` 内容上传到 GCS。
3. 更新 `assets.storage_path` 为统一 key。
4. 切换生产配置到 `gcs` backend。
5. 观察一段时间后再移除本地卷依赖。

迁移脚本只做明确处理：

- 文件存在才上传
- 文件缺失直接报错
- 不做静默跳过
- 不做自动回退到本地卷

派生缩略图可以在迁移后按需重新生成，不要求一次性全量预热。

## 配置

新增配置项：

- `ASSET_STORAGE_BACKEND=local|gcs`
- `ASSET_STORAGE_GCS_BUCKET`
- `ASSET_STORAGE_GCS_PREFIX=generated-assets`

本地开发继续使用 `GENERATED_ASSETS_DIR`。
GCS 凭据由 Google 官方认证链路提供，不写入代码仓库。

## 影响范围

主要会改这些位置：

- `apps/api/app/domains/image/*`
- `apps/api/app/domains/llm/*`
- `apps/api/app/core/config.py`
- `apps/api/requirements.txt`
- `apps/worker/worker/*`
- `docker-compose.yml`
- `.env.example`
- 相关测试

前端基本不需要改，因为公开 URL 结构保持不变。

## 风险与处理

- bucket 不可用时，读写直接失败并返回显式错误。
- 旧数据若仍指向本地绝对路径，需要先跑迁移脚本。
- 任意模块继续直接用 `Path(asset.storage_path)` 都会在 GCS 模式下失败，必须一起清掉。

## 测试策略

至少覆盖这些场景：

- 上传写入 GCS backend 后，返回的资产 URL 正常可读
- 生成任务写入 GCS backend 后，gallery 和 job result 仍正常返回
- 缩略图在 GCS backend 下可生成且尺寸正确
- provider 参考图读取不再依赖本地路径
- 删除资产会同时删除原图和派生缩略图
- 迁移脚本在缺文件时显式失败

## 验收标准

1. 生产配置切到 `gcs` 后，图库不再依赖共享磁盘卷。
2. 用户端、后台端、worker 仍然通过现有 API 正常访问图片。
3. 迁移脚本能把现有资产完整搬到 GCS。
4. 代码里不再出现业务域直接读写 `Path(asset.storage_path)` 的路径依赖。
