## 1. 数据层：每道菜最后食用时间

- [x] 1.1 在 `frontend/lib/wheel.js` 新增 `lastEatenByRecipe(orders)`：遍历未隐藏订单的 `items[].recipeId` 与 `createdAt`，聚合每道菜 `lastEaten = max(createdAt)`，从未出现的菜无记录（对应 spec"候选池构建"、design D6）
- [x] 1.2 首页菜单渲染后在后台读取 `api.getOrders()` 并预计算候选名单。关闭重开复用名单，点「换一批」后缓存新名单（design D6）。
- [x] 1.3 订单请求失败时标记 `lastEatenUnavailable`，供降级使用（对应 spec"订单数据加载失败降级"）

## 2. 抽样逻辑（纯函数，便于单测）

- [x] 2.1 `buildPools(recipes, lastEaten, now)`：按 lastEaten 升序排序（null 视为最久），切分新鲜池（近 7 天没吃过，含从未吃过）与最近池（近 7 天吃过，最久→最近）（design D4/D5）
- [x] 2.2 `sampleWheel(recipes, lastEaten, now)`：新鲜池 ≥ 6 随机抽 6；否则新鲜池全部 + 最近池按最久没吃补到 6；总数 < 6 有几道放几道（对应 spec"固定 6 格抽样""不足 6 道保底"）
- [x] 2.3 `reshuffleWheel(...)`：新鲜池 ≥ 6 全量重抽；< 6 固定新鲜菜、按最久到最近的顺序轮换补位格（对应 spec"换一批"）
- [x] 2.4 处理 lastEaten 并列次序（用 orderCount 或 id 兜底，design Open Questions）
- [x] 2.5 订单不可用时降级为全池随机抽 6（不排除最近）（spec"订单数据加载失败降级"）

## 3. 入口与弹窗骨架

- [x] 3.1 `index.wxml` toolbar 搜索框后新增纯图标 🎲 按钮，禁用规则与"新建菜谱/分类管理"一致（拖拽、排序保存或提交订单时禁用）（spec"转盘入口"、design D1）
- [x] 3.2 `index.js` 增加转盘弹窗状态（wheelOpen、wheelItems、spinning、result 等）与 open/close/reshuffle/spin 处理函数
- [x] 3.3 用 `t-popup` 承载转盘弹窗，关闭不影响首页搜索词/购物车/滚动位置（spec"弹窗形态"、design D2）
- [x] 3.4 `index.wxss` 增加入口图标与弹窗布局样式

## 4. 转盘渲染与动画

- [x] 4.1 canvas 2d 绘制 6 扇区与沿半径旋转的菜名标签（7 字菜名可读）（design D3/D7）
- [x] 4.2 "开始转"触发旋转动画，指针固定、盘转动，停止后按最终角度反算唯一中奖格（spec"开始转与抽中"）
- [x] 4.3 旋转期间禁用旋转、换一批和加购操作，动画结束恢复（spec「旋转期间禁止重复操作」）
- [x] 4.4 抽中后保留弹窗并显示菜名。点「加入购物车」后加一份、关闭弹窗并更新购物车浮条。关闭或换一批时清除抽中结果（spec「开始转与抽中」、design D8）
- [x] 4.5 存在待确认订单（`cartPending`）时禁用「开始转」和「加入购物车」，与首页数量控件的锁定规则一致。
- [x] 4.6 抽中后提供「再转一次」，沿用当前候选菜，从停止角度继续转动，停下后更新结果。

## 5. 降级与边界

- [x] 5.1 菜谱总数 < 6：退化为"今天就吃它"卡片而非转盘（spec"极小与空菜单降级"）
- [x] 5.2 空菜单：提示先创建菜谱，不展示空转盘（spec"空菜单提示"）
- [x] 5.3 订单不可用：非阻塞提示"最近吃过记录暂不可用"，转盘仍可用（spec"订单加载失败降级"）

## 6. 测试与验证

- [x] 6.1 在 `frontend/tests/market.test.js` 为 `buildPools`/`sampleWheel`/`reshuffleWheel` 增加单测：新鲜池充足、不足保底、最久没吃优先、从未吃过排前、换一批常驻、订单失败降级（覆盖各 spec 场景）
- [x] 6.2 运行前端测试与 `tools/check-project.js` 确认通过
- [x] 6.3 微信开发者工具模拟器与前端测试验证：入口禁用规则、弹窗开合、6 格可读、旋转抽中、指针固定、极小/空菜单降级
- [x] 6.4 后端 `mvnw -o test-compile` 确认未受影响（本任务默认纯前端，不改后端）

## 7. 可选升级：后端统计接口（仅当 LIMIT 50 精度不足时）

- [ ] 7.1 `OrderMapper` 新增只读查询：`order_items JOIN orders` 按 `recipe_id` 取 `MAX(created_at)`，`deleted_at IS NULL`（design D6 升级路径；**读时计算，不在 recipes 上加 last_eaten_at 字段**，见 D6 否决的备选）
- [ ] 7.2 `OrderRepository`/`OrderController` 暴露 `GET /api/recipes/last-eaten`，返回 `{recipeId: lastEaten}`
- [ ] 7.3 前端 `wheel.js` 数据源切换为该接口，移除 LIMIT 50 依赖；补后端测试
