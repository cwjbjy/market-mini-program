# 家庭厨房

原生微信小程序用于浏览菜单、管理菜谱和分类、点单并查看最近订单。服务沿用免登录模式，能够访问 API 的用户共享同一套菜单和订单。

## 目录

| 路径 | 内容 |
| --- | --- |
| `frontend/` | 原生小程序、TDesign 组件依赖和静态素材 |
| `backend/` | Java 17、Spring Boot 3.5.14 和 MyBatis-Plus，按 controller、service、vo、entity、dto、repository、mapper 等职责分层 |
| `compose.yml` | 本地 MySQL 8.0 容器和数据卷 |
| `Dockerfile` | 构建 Java 后端镜像 |
| `compose.prod.yml` | 部署 Java 后端和独立的 MySQL 容器 |

`controller` 提供 HTTP 接口，`dto` 定义请求数据（`CatalogDtos.SaveCategory`、`OrderDtos.SubmitOrder` 等），`vo` 定义返回给前端的业务对象（`CategoryVO`、`RecipeVO`、`OrderVO`），`web` 放置统一响应和 HTTP 异常处理。`CategoryController` 和 `RecipeController` 共用 `CategoryService`。Service 处理业务规则和事务，Repository 接收 `vo` 中的业务对象，并通过 Mapper 和 `entity` 中的表行对象（`CategoryEntity`、`RecipeEntity`、`OrderEntity`）读写 MySQL。菜单联查、订单明细和下单锁定的 SQL 位于 `backend/src/main/resources/mapper/`。`image` 包负责图片引用校验和本地文件存储。

### 小程序目录与分包

| `frontend/` 下的目录 | 用途 |
| --- | --- |
| `pages/` 和 `custom-tab-bar/` | 主包中的首页、订单、账号和底部导航 |
| `packages/catalog/` | 菜单分包。`recipe/` 放菜谱详情和表单，`category/` 放分类管理，`sort/` 放分类管理的拖动逻辑 |
| `vegetable/` | 旧版菜谱和分类路径的跳转入口 |
| `lib/` 和 `static/` | 主包共享的 API、购物车逻辑和静态素材 |
| `tests/` 和 `tools/` | 本地测试与检查脚本，由微信打包配置排除 |

首页预加载 `catalog` 分包。页面和分包路径在 `frontend/app.json` 中注册，TDesign 由微信开发者工具构建到 `frontend/miniprogram_npm/`。

## 本地运行

在项目根目录启动 MySQL。Compose 将 `3306` 绑定到本机，等待应用用户可以连接 `market_app`。Java 后端启动时由 Flyway 创建或升级表结构。

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

在项目根目录可单独构建 Java 后端镜像。

```powershell
docker build -t market-kitchen:local .
```

线上 Compose 通过项目内部网络连接 MySQL，保留原有的 `mysql_data` 数据卷和 `uploads` 图片目录。Java 后端默认通过宿主机 `127.0.0.1:9001` 接收反向代理流量。

生产 MySQL 使用 64 MiB 的 InnoDB 缓冲池，关闭 Performance Schema，容器内存上限为 512 MiB。将这些参数同步到服务器上的 Compose 文件后，下一次部署会短暂重建 MySQL 容器并挂载原有数据卷。

首次异机部署要上线本地已有菜单时，使用 `mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF --no-create-info --skip-triggers market_app categories recipes orders order_items` 从本机导出业务数据，再用线上 MySQL 容器里的 `mysql` 客户端导入已经初始化表结构的空库。把 `backend/local/uploads` 中的图片复制到目标主机的部署目录下。

### 数据库表结构迁移

迁移脚本保存在 [db/migration](backend/src/main/resources/db/migration)。首次接入 Flyway 时，已有业务表的 `market_app` 会自动登记基线 `0`，再执行与旧版相同的幂等建表 SQL。全新数据库直接执行 `V1__initial_schema.sql`。按现有 tag 流程发布即可，由后端启动时完成迁移。

后续表结构变更使用新的版本脚本。Flyway 在 `flyway_schema_history` 记录已经应用的版本。回滚后端镜像时，已经提交的 MySQL 表结构变更仍会保留。

制作步骤通过 Flyway V2–V4 升级。`recipes` 和 `order_items` 新增 `instructions` JSON，包含有序的 `steps` 和独立的 `tips`。回填会应用 22 道菜谱的整理结果，原文有变化的菜谱按实际原文转换。历史订单从各自的下单快照回填。旧 `steps` 列保留旧原文，供核对。

切换版本前备份 MySQL，并在发布窗口部署新版 Java 服务和小程序。新版 Java 启动时会自动转换数据，菜谱编辑接口同步切换为 `instructions`。

### GitHub Actions 发布到阿里云

推送 tag 时，CI 使用 GitHub runner 预装的 MySQL 执行后端测试。测试通过后构建 `linux/amd64` Java 后端镜像，以 `<tag>` 和 `sha-<提交 SHA>` 标记并推送到杭州 ACR 的 `node_caowj/market-kitchen` 仓库。普通分支推送不触发 CI，PR 只运行测试。

生产部署通过 `appleboy/ssh-action` 登录服务器，在 `/opt/market-kitchen` 用已有的 `compose.prod.yml` 执行 `docker compose up -d --wait`。后端使用本次构建的镜像摘要，独立的 MySQL 服务使用服务器预拉取的镜像和原有数据卷。启动失败或健康检查超时时，CI 将该次部署标记为失败。

首次准备包括以下四步。

1. 在阿里云 ACR 创建 `node_caowj/market-kitchen` 私有镜像仓库。
2. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 配置下表。SSH 端口默认为 22，可通过变量 `DEPLOY_SSH_PORT` 修改。
3. 为部署用户准备可写的 `/opt/market-kitchen`，将仓库中的 [compose.prod.yml](compose.prod.yml) 上传到该目录。服务器需要 Docker Compose，SSH 端口需对部署 runner 可达。部署用户需要登录 ACR，预拉取 `registry.cn-hangzhou.aliyuncs.com/node_caowj/mysql:latest`，并将部署专用 SSH 公钥加入该用户的 `authorized_keys`。
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

配置完成后，日常提交推送分支不会触发 CI。需要发布时打一个 tag 并推送即可，CI 会依次执行测试、构建容器和部署。

```powershell
git tag v1.2.3
git push origin v1.2.3
```

Compose 配置由服务器上的文件提供。仓库中的 `compose.prod.yml` 有变更时，先把新文件同步到服务器，再发布 tag。在服务器可直接查询容器状态和后端使用的镜像。

```sh
docker ps --filter label=com.docker.compose.project=market-kitchen
docker inspect --format '{{.Config.Image}}' market-kitchen-market-1
```

新后端通过健康检查后，CI 在同一次 SSH 部署中清理服务器上本项目未被容器使用的旧后端镜像。

在 `frontend/config.js` 为体验版和正式版填写部署环境的 HTTPS API 地址，并在微信小程序后台配置 request、uploadFile 合法域名。使用实际小程序 AppID，通过微信开发者工具上传 `frontend/`。

## 接口

JSON 响应包含 `code`、`message`、`data`。成功的 `code` 为 0，失败使用相应的 HTTP 状态码。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/categories` | 读取分类及其菜谱 |
| `POST /api/categories`、`PUT /api/categories/{id}`、`DELETE /api/categories/{id}` | 管理分类 |
| `PUT /api/categories/order/batch` | 保存大分类顺序 |
| `PUT /api/categories/{id}/recipes/order` | 保存该分类内的菜谱顺序 |
| `GET /api/recipes/{id}` | 读取菜谱详情 |
| `POST /api/recipes`、`PUT /api/recipes/{id}`、`DELETE /api/recipes/{id}` | 管理菜谱，更新时可改变分类 |
| `POST /api/images` | 上传 multipart 字段 `file`，返回 `{path}` |
| `GET /api/orders/page?cursor=...` | 分批查看订单，每批 15 条。首批省略游标，后续使用响应中的 `nextCursor` |
| `GET /api/orders/{id}`、`DELETE /api/orders/{id}` | 查看或删除指定订单 |
| `GET /api/orders` | 供旧版小程序查看最近 50 条订单 |
| `POST /api/orders` | 提交 `{requestId,items:[{recipeId,quantity}]}` |

订单保存下单时的菜名、配料、做法、图片和数量。同一次提交在超时重试时复用 `requestId`，每种菜谱只累计一次点单次数。删除菜谱、分类或换图后，历史订单仍使用原来的图片。

排序接口接收 `{ids, expectedIds}`，分别表示调整后的 ID 顺序与调整前的 ID 顺序。首页可长按左侧分类，或长按右侧菜品的图片、名称，上下拖动并松手保存。菜品在原分类内排序，清除搜索后可继续拖动。分类管理页也支持长按卡片调整分类顺序。保存沿用 MySQL 已有的 `sort_order` 字段，已有排序接口的部署只需更新小程序前端，无需重新导入数据。

## 验证

- 在 `backend/` 执行 `.\mvnw.cmd test`。运行数据库集成测试时，将 `MARKET_TEST_MYSQL_URL` 指向测试 MySQL 实例（例如 `jdbc:mysql://127.0.0.1:3307/`），并设置 `MARKET_TEST_MYSQL_USER` 和 `MARKET_TEST_MYSQL_PASSWORD`。测试账户需要创建和删除 `market_test_*` 临时库的权限。
- 在 `frontend/` 执行 `npm test` 验证购物车、搜索、接口与旧入口跳转，执行 `npm run check` 检查页面路径、分包引用和静态资源。在微信开发者工具完成 **工具 → 构建 npm** 后执行 `npm run check:build`，检查生成的 TDesign 组件文件。
- 在微信开发者工具及真机检查六个页面、搜索和分类联动、左滑与纵向滚动、底部抽屉安全区、图片上传及替换、购物车恢复和下单重试。
