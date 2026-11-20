原生微信小程序用于浏览菜单、管理菜谱和分类、点单并查看最近订单。服务沿用免登录模式，能够访问 API 的用户共享同一套菜单和订单。

## 目录

| 路径 | 内容 |
| --- | --- |
| `frontend/` | 原生小程序、TDesign 组件依赖和静态素材 |
| `backend/` | Java 17 和 Spring Boot 3.5.14，按 controller、service、mapper、entity、dto 等职责分层 |
| `compose.yml` | 本地 MongoDB 8.0 单节点副本集 |
| `Dockerfile` | 将后端和 MongoDB 打包到同一个镜像 |

## 本地运行

在项目根目录启动 MongoDB。Compose 将数据库端口绑定到本机，并等待 `rs0` 副本集的主节点可写。点单和菜谱移动使用 MongoDB 事务，连接地址需要指向副本集。

```powershell
docker compose up -d --wait
```

在宿主机手动启动后端。

```powershell
Set-Location backend
.\mvnw.cmd spring-boot:run
```

| 后端环境变量 | 默认值 |
| --- | --- |
| `MARKET_MONGODB_URI` | `mongodb://localhost:27017/market_app?replicaSet=rs0` |
| `MARKET_UPLOAD_DIR` | 后端工作目录下的 `local/uploads` |
| `MARKET_SERVER_PORT` | `8080` |

新库可通过小程序先建分类、上传分类图片，然后新建菜谱。

打开另一个终端，在 `frontend/` 执行 `npm ci`。用微信开发者工具导入同一目录，选择 **工具 → 构建 npm**。开发环境默认访问 `http://127.0.0.1:8080`。本机模拟器联调可关闭合法域名校验，手机预览开发版时应将开发地址改为手机可访问的地址。

## Docker 部署

在项目根目录构建包含 Java 后端和 MongoDB 8.0 的镜像。

```powershell
docker build -t market-kitchen:local .
```

在本机使用已迁移的数据库时，先停止 Compose 数据库，并确认宿主机上的开发后端已释放 `8080` 端口。两个 MongoDB 实例不能同时访问同一个数据卷。

```powershell
docker compose stop
$mongoVolume = (docker compose config --format json | ConvertFrom-Json).volumes.mongo_data.name
New-Item -ItemType Directory -Force -Path backend/local/uploads | Out-Null
$uploads = (Resolve-Path backend/local/uploads).Path
docker run -d --name market-kitchen --restart unless-stopped --stop-timeout 45 `
  -p 127.0.0.1:8080:8080 `
  --mount "type=volume,source=$mongoVolume,target=/data/db" `
  --mount "type=bind,source=$uploads,target=/data/uploads" `
  market-kitchen:local
```

镜像启动时初始化容器内的 `rs0` 副本集，并在数据库可写后启动后端。容器对外映射 `8080`，MongoDB 仅监听容器内部。`/data/db` 保存数据库，`/data/uploads` 保存上传图片。切回本地开发前，先执行 `docker stop market-kitchen`，再启动 Compose 数据库。已创建的合并容器可在停止 Compose 数据库后用 `docker start market-kitchen` 重新启动。

异机部署时，镜像与业务数据分别传输。在目标主机创建新的 MongoDB 持久卷，使用 `mongodump` 从本机备份 `market_app`，再通过目标容器内的 `mongorestore` 恢复到空库。将 `backend/local/uploads` 中的图片文件复制到目标主机，并将该目录挂载到容器的 `/data/uploads`。由部署环境将 HTTPS 请求转发到后端端口。

在 `frontend/config.js` 为体验版和正式版填写部署环境的 HTTPS API 地址，并在微信小程序后台配置 request、uploadFile 合法域名。使用实际小程序 AppID，通过微信开发者工具上传 `frontend/`。

## 接口

JSON 响应包含 `code`、`message`、`data`。成功的 `code` 为 0，失败使用相应的 HTTP 状态码。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/categories` | 读取分类及其菜谱 |
| `POST /api/categories`、`PUT /api/categories/{id}`、`DELETE /api/categories/{id}` | 管理分类 |
| `GET /api/recipes/{id}` | 读取菜谱详情 |
| `POST /api/recipes`、`PUT /api/recipes/{id}`、`DELETE /api/recipes/{id}` | 管理菜谱，更新时可改变分类 |
| `POST /api/images` | 上传 multipart 字段 `file`，返回 `{path}` |
| `GET /api/orders`、`DELETE /api/orders/{id}` | 查看最近 50 条订单或删除指定订单 |
| `POST /api/orders` | 提交 `{requestId,items:[{recipeId,quantity}]}` |

订单保存下单时的菜名、配料、做法、图片和数量。同一次提交在超时重试时复用 `requestId`，每种菜谱只累计一次点单次数。删除菜谱、分类或换图后，历史订单仍使用原来的图片。

## 验证

- 在 `backend/` 执行 `.\mvnw.cmd test`。要运行数据库集成测试，先设置 `MARKET_TEST_MONGODB_URI` 为测试副本集地址，测试会创建临时数据库。
- 在 `frontend/` 执行 `npm test` 验证购物车、搜索与接口逻辑，执行 `npm run check` 检查页面配置、静态资源与组件路径。
- 在微信开发者工具及真机检查六个页面、搜索和分类联动、左滑与纵向滚动、底部抽屉安全区、图片上传及替换、购物车恢复和下单重试。
