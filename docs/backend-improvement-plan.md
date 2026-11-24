# 家庭厨房后端改进计划

状态为待实施。建议优先保护线上写接口，随后简化集成测试，最后在准备好图片备份和迁移方案后切换生产存储。

| 改进项 | 当前做法 | 计划 |
| --- | --- | --- |
| Spring Security | 应用层接口直接处理请求 | 接入微信登录，按家庭成员和管理员角色授权 |
| Testcontainers | 本地通过环境变量连接测试 MySQL，CI 使用 runner 预装的 MySQL | 本地按需自动启动临时 MySQL，评估通过后统一 CI 测试环境 |
| 阿里云 OSS Java SDK | Java 读写本地目录，生产通过 Docker 挂载服务器上的 `uploads` | 生产使用 OSS，本地开发继续使用文件存储 |

## Spring Security

当前分类、菜谱、图片和订单接口由 Controller 直接提供。计划把权限规则集中到 Spring Security，并在小程序的请求层统一处理登录状态。 [接口清单](../README.md#接口) · [Spring Security 授权文档](https://docs.spring.io/spring-security/reference/servlet/authorization/index.html)

1. 小程序调用 `wx.login` 获取临时登录码，后端调用微信接口获取用户身份，并签发应用自己的访问令牌。小程序在普通请求和图片上传时统一携带令牌。
2. 建议沿用家庭共享订单模式。未登录用户可读菜单和展示图片。获准加入的家庭成员可下单和查看共享订单，管理员可修改分类和菜谱、调整排序、上传图片和删除订单。由服务端维护成员和管理员名单。
3. 统一返回未登录或令牌失效时的 `401`，以及权限不足时的 `403`，沿用当前 API 响应格式。先用体验版验证，再协调小程序发布与生产后端切换时间。仍在使用旧版的小程序在写接口启用鉴权后会收到 `401`，发布前应验证升级后的登录流程。

**验收**　家庭成员能点单并查看共享订单。普通成员调用管理接口得到 `403`。管理员能完成菜单维护和图片上传。令牌失效后小程序能引导用户重新登录。

## Testcontainers

目前数据库集成测试通过 `MARKET_TEST_MYSQL_*` 环境变量获取连接，每个测试创建独立的 `market_test_*` 数据库。未设置连接地址时，这组测试会跳过。 [MySqlFlowTest.java](../backend/src/test/java/cn/marketkitchen/MySqlFlowTest.java) · [当前 CI](../.github/workflows/ci.yml)

1. 在测试依赖中加入 Testcontainers 的 JUnit 5 和 MySQL 模块。选用与生产一致的 MySQL 主次版本并固定镜像版本，从临时容器动态获取 JDBC 地址和端口。
2. 为 MySQL 集成测试提供单独的 Maven 入口，启用时自动启动和清理容器。保留按测试隔离数据库的行为，普通接口测试仍可独立运行。已配置外部测试库时，接受现有环境变量作为显式覆盖。
3. 先在本地验证。再比较 GitHub Actions 上的冷启动耗时、重复运行耗时及稳定性，确定是否以临时容器接替 runner 预装的 MySQL。选择切换后，将该测试入口设为发布前的验证步骤。

**验收**　在 Docker 可用的机器上，未配置测试库地址时也能运行现有 7 项 MySQL 流程测试。测试结束后，临时容器由测试框架清理，本地开发库中的菜单数据可继续使用。 [Testcontainers MySQL 文档](https://java.testcontainers.org/modules/databases/mysql/)

## 阿里云 OSS Java SDK

当前图片在本地保存在 `backend/local/uploads`，生产由 Java 从挂载目录读取，菜单和订单使用 `/static/images/market/<文件名>` 引用图片。迁移时沿用这些路径，让已经保存的菜单和订单继续显示图片。 [LocalImageStorage.java](../backend/src/main/java/cn/marketkitchen/image/LocalImageStorage.java) · [生产 Compose](../compose.prod.yml)

1. 从现有实现抽取图片存储接口，用配置选择本地文件或 OSS。继续在服务端校验 JPG、PNG、文件大小和分辨率，上传接口继续返回相同格式的图片路径。
2. 在生产配置私有 Bucket 和应用专用的存储权限。第一阶段由 Java 经原有路径从 OSS 流式读取图片，沿用现有小程序域名和缓存策略。生产服务器和 Bucket 在同地域时，可配置 OSS 内网 Endpoint。
3. 以生产数据库中的分类、菜谱和历史订单为依据核对引用，从服务器 `uploads` 备份并复制文件到 OSS，保留文件名。对比文件数量和校验值，按实际格式设置 `Content-Type`，兼容历史上 JPG 内容使用 PNG 扩展名的图片。
4. 新上传和读图都通过验证后再切换生产存储。切换初期保留原目录备份。需要回退时，先把切换后新增的图片同步回服务器，核对可读后再切回本地存储。上线后按用量观察存储、请求和流量账单。 [OSS Java SDK 文档](https://help.aliyun.com/zh/oss/developer-reference/overview-13/) · [OSS 计费说明](https://help.aliyun.com/zh/oss/billing-overview)

**验收**　旧菜单、菜谱详情和历史订单的图片均可打开。新上传的图片在重启容器后仍可读取，接口返回正确的图片类型，回退时切换后新增的图片也能继续显示。
