# 家庭厨房

原生微信小程序用于浏览菜单、管理菜谱和分类、点单并查看最近订单。服务沿用免登录模式，能够访问 API 的用户共享同一套菜单和订单。

## 目录

| 路径 | 内容 |
| --- | --- |
| `frontend/` | 原生小程序、TDesign 组件依赖和静态素材 |
| `backend/` | Java 17、Spring Boot 3.5.14 和 MyBatis-Plus，按 controller、service、domain、repository、mapper 等职责分层 |
| `compose.yml` | 本地 MySQL 8.0 容器和数据卷 |
| `Dockerfile` | 将后端和 MySQL 8.0 打包到同一个镜像 |

`controller` 提供 HTTP 接口，`dto` 定义请求数据，`web` 放置统一响应和 HTTP 异常处理。`CategoryController` 和 `RecipeController` 共用 `CategoryService`。Service 处理业务规则和事务，Repository 接收 `domain` 中的业务对象，并通过 Mapper 和 `mapper.model` 中的行对象读写 MySQL。菜单联查、订单明细和下单锁定的 SQL 位于 `backend/src/main/resources/mapper/`。`image` 包负责图片引用校验和本地文件存储。

### 小程序目录与分包

| `frontend/` 下的目录 | 用途 |
| --- | --- |
| `pages/` 和 `custom-tab-bar/` | 主包中的首页、订单、账号和底部导航 |
| `packages/catalog/` | 菜单分包。`recipe/` 放菜谱详情与新建、编辑共用的表单，`category/` 放分类管理 |
| `vegetable/` | 旧版菜谱和分类路径的跳转入口 |
| `lib/` 和 `static/` | 主包共享的 API、购物车逻辑和静态素材 |
| `tests/` 和 `tools/` | 本地测试与检查脚本，由微信打包配置排除 |

首页预加载 `catalog` 分包。页面和分包路径在 `frontend/app.json` 中注册，TDesign 由微信开发者工具构建到 `frontend/miniprogram_npm/`。

## 本地运行

在项目根目录启动 MySQL。Compose 将 `3306` 绑定到本机，等待应用用户可以连接 `market_app`。Java 后端首次启动时会创建所需的表。

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
| `MARKET_MYSQL_URL` | `jdbc:mysql://127.0.0.1:3306/market_app?sslMode=DISABLED&allowPublicKeyRetrieval=true` |
| `MARKET_MYSQL_USER` | `market` |
| `MARKET_MYSQL_PASSWORD` | `market-local` |
| `MARKET_UPLOAD_DIR` | 后端工作目录下的 `local/uploads` |
| `MARKET_SERVER_PORT` | `8080` |

本地 Compose 用 `MARKET_MYSQL_ROOT_PASSWORD` 设置初始化时的 root 密码，默认 `market-root-local`。如需改本机映射端口，设置 `MARKET_MYSQL_PORT` 并在后端的 `MARKET_MYSQL_URL` 中使用相同端口。新库可以从小程序添加分类和菜谱。

打开另一个终端，在 `frontend/` 执行 `npm ci`。用微信开发者工具导入同一目录，选择 **工具 → 构建 npm**。开发环境默认访问 `http://127.0.0.1:8080`。本机模拟器联调可关闭合法域名校验，手机预览开发版时应将开发地址改为手机可访问的地址。

## Docker 部署

在项目根目录构建包含 Java 后端和 MySQL 8.0 的镜像。

```powershell
docker build -t market-kitchen:local .
```

在本机使用已迁移的数据库时，先停止 Compose 的 MySQL，并确认宿主机上的开发后端已释放 `8080` 端口。同一个 MySQL 数据卷每次只交给一个容器。

```powershell
docker compose stop mysql
$config = docker compose config --format json | ConvertFrom-Json
$mysqlVolume = $config.volumes.mysql_data.name
$env:MARKET_MYSQL_USER = $config.services.mysql.environment.MYSQL_USER
$env:MARKET_MYSQL_PASSWORD = $config.services.mysql.environment.MYSQL_PASSWORD
$env:MARKET_MYSQL_ROOT_PASSWORD = $config.services.mysql.environment.MYSQL_ROOT_PASSWORD
New-Item -ItemType Directory -Force -Path backend/local/uploads | Out-Null
$uploads = (Resolve-Path backend/local/uploads).Path
docker run -d --name market-kitchen --restart unless-stopped --stop-timeout 45 `
  -p 127.0.0.1:8080:8080 `
  --env MARKET_MYSQL_USER --env MARKET_MYSQL_PASSWORD --env MARKET_MYSQL_ROOT_PASSWORD `
  --mount "type=volume,source=$mysqlVolume,target=/var/lib/mysql" `
  --mount "type=bind,source=$uploads,target=/data/uploads" `
  market-kitchen:local
```

合并容器在 MySQL 可用后启动后端。`8080` 提供 HTTP，MySQL 仅监听容器内的回环地址。`/var/lib/mysql` 保存数据库，`/data/uploads` 保存上传图片。切回本地开发时，先执行 `docker stop market-kitchen`，再执行 `docker compose up -d --wait`。已创建的合并容器可在停止 Compose MySQL 后用 `docker start market-kitchen` 重新启动。

异机部署时，为合并容器设置 `MARKET_MYSQL_PASSWORD` 和 `MARKET_MYSQL_ROOT_PASSWORD`，在目标主机创建并挂载新的 `/var/lib/mysql` 持久卷。使用 `mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF --no-create-info --skip-triggers market_app` 从本机导出数据，再用目标容器里的 `mysql` 导入已经初始化表结构的空库。把 `backend/local/uploads` 中的图片复制到目标主机并挂载到 `/data/uploads`，由部署环境将 HTTPS 请求转发到后端端口。

### GitHub Actions 发布到阿里云

分支推送、PR 和版本 tag 都会运行后端测试。推送 `1.0.0` 或 `v1.0.0` 这类 tag 时，测试通过后构建 `linux/amd64` 合并镜像，推送到杭州 ACR 的 `node_caowj/market-kitchen` 仓库。流水线通过 SSH 在 `/opt/market-kitchen` 用 `docker compose pull` 和 `docker compose up -d --wait` 更新容器。新容器通过健康检查后记录本次镜像摘要，启动失败时尝试恢复上一版。MySQL 和上传图片分别存放于持久卷和挂载目录。

首次准备包括以下四步。

1. 在阿里云 ACR 创建 `node_caowj/market-kitchen` 私有镜像仓库。
2. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 配置下表。SSH 端口默认为 22，可通过变量 `DEPLOY_SSH_PORT` 修改。
3. 为部署用户准备可写的 `/opt/market-kitchen`，服务器需要 Docker Compose 和 Bash，SSH 端口需对部署 runner 可达。使用部署用户在服务器执行 `docker login registry.cn-hangzhou.aliyuncs.com`，为私有镜像拉取配置凭据。将部署专用 SSH 公钥加入该用户的 `authorized_keys`。
4. 将 `docker/init-env.sh` 上传到服务器的 `/opt/market-kitchen/init-env.sh`。使用部署用户在服务器执行以下命令。脚本用 OpenSSL 生成应用账号和 root 的密码，保留已有的 `.env`。宿主机 Nginx 将 HTTPS API 域名反代到 `127.0.0.1:9001`，可通过 `.env` 中的 `MARKET_HOST_PORT` 修改本机端口。该域名需要同时代理 `/api/` 和 `/static/images/market/`。

   ```sh
   cd /opt/market-kitchen
   sh init-env.sh
   ```

| GitHub Secret | 用途 |
| --- | --- |
| `ACR_USERNAME`、`ACR_PASSWORD` | CI 登录 ACR 并推送镜像 |
| `DEPLOY_HOST`、`DEPLOY_USER` | 服务器地址与 SSH 用户 |
| `DEPLOY_SSH_KEY` | 部署专用 SSH 私钥 |

提交并推送包含本工作流和后端改动的代码后，打一个新版本 tag 并推送。

```powershell
git tag 1.0.0
git push origin 1.0.0
```

首次部署使用新的 MySQL 卷。要上线本地已有菜单，按上面的方式将 `market_app` 导入服务器容器，并把图片复制到 `/opt/market-kitchen/uploads`。每次成功部署的配置和镜像摘要保存为部署目录下的 `compose.prod.yml` 和 `.market-image`。在服务器查看当前部署可执行以下命令。

```sh
cd /opt/market-kitchen
MARKET_IMAGE="$(cat .market-image)" docker compose -f compose.prod.yml ps
```

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

- 在 `backend/` 执行 `.\mvnw.cmd test`。运行数据库集成测试时，将 `MARKET_TEST_MYSQL_URL` 指向测试 MySQL 实例（例如 `jdbc:mysql://127.0.0.1:3307/`），并设置 `MARKET_TEST_MYSQL_USER` 和 `MARKET_TEST_MYSQL_PASSWORD`。测试账户需要创建和删除 `market_test_*` 临时库的权限。
- 在 `frontend/` 执行 `npm test` 验证购物车、搜索、接口与旧入口跳转，执行 `npm run check` 检查页面路径、分包引用和静态资源。在微信开发者工具完成 **工具 → 构建 npm** 后执行 `npm run check:build`，检查生成的 TDesign 组件文件。
- 在微信开发者工具及真机检查六个页面、搜索和分类联动、左滑与纵向滚动、底部抽屉安全区、图片上传及替换、购物车恢复和下单重试。
