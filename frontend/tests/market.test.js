const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../lib/api');
const cart = require('../lib/cart');
const { filterCategories } = require('../lib/search');
const cardGestures = require('../packages/catalog/sort/layout.wxs');
const homeGestures = require('../pages/index/home-order.wxs');

test('search retains all categories for whitespace and matches partial names or one edit', () => {
  const categories = [
    { id: '1', recipes: [{ name: '红烧肉' }, { name: '清蒸鲈鱼' }] },
    { id: '2', recipes: [{ name: '西红柿炒蛋' }] },
    { id: '3', recipes: [] },
  ];

  assert.equal(filterCategories(categories, '  '), categories);
  for (const query of ['红烧', '红绕肉', '红烧五肉', '红肉']) {
    assert.deepEqual(filterCategories(categories, query).map((category) => category.recipes), [[{ name: '红烧肉' }]]);
  }
  assert.deepEqual(filterCategories(categories, '青蒸桂鱼'), []);
});

function mockCartStorage() {
  const disk = new Map();
  global.wx = {
    getStorageSync: (key) => structuredClone(disk.get(key)),
    setStorageSync: (key, value) => disk.set(key, structuredClone(value)),
  };
}

function mockPage(modulePath) {
  let page;
  global.Page = (definition) => {
    page = { ...definition, data: structuredClone(definition.data) };
    page.setData = (patch, callback) => {
      Object.assign(page.data, patch);
      if (callback) callback();
    };
  };
  try {
    delete require.cache[require.resolve(modulePath)];
    require(modulePath);
  } finally {
    delete global.Page;
  }
  return page;
}

function mockHomePage() {
  const page = mockPage('../pages/index/index');
  page.onLoad();
  page.categories = [{ id: 'category', recipes: [{ id: 'recipe:one', name: '番茄炒蛋' }] }];
  page.renderCatalog();
  return page;
}

function mockHomeOrder({ recipeViewportBottom = 420, deferMeasure = false } = {}) {
  mockCartStorage();
  const page = mockHomePage();
  page.categories = [
    { id: 'a', name: '热菜', recipes: ['r1', 'r2', 'r3'].map((id) => ({ id, name: id })) },
    { id: 'b', name: '凉菜', recipes: [{ id: 'r4', name: 'r4' }] },
    { id: 'c', name: '汤羹', recipes: [] },
  ];
  page.setData({ loading: false });
  page.renderCatalog();

  const viewports = {
    category: { left: 0, right: 80, top: 100, bottom: 420, height: 320 },
    recipe: { left: 80, right: 375, top: 100, bottom: recipeViewportBottom, height: recipeViewportBottom - 100 },
  };
  const sectionBoxes = [{ top: 100, bottom: 365 }, { top: 365, bottom: 510 }, { top: 510, bottom: 900 }];
  const recipeBoxes = [{ top: 140, bottom: 190 }, { top: 195, bottom: 277 }, { top: 282, bottom: 352 }];
  page.createSelectorQuery = () => {
    const selectors = [];
    const query = {
      select: (selector) => { selectors.push(selector); return query; },
      selectAll: (selector) => { selectors.push(selector); return query; },
      boundingClientRect: () => query,
      scrollOffset: () => query,
      exec: (callback) => {
        const rowSelector = selectors[2];
        const recipePosition = { scrollTop: 0, scrollHeight: 800 };
        if (rowSelector === '.catalog-section') {
          callback([viewports.recipe, recipePosition, sectionBoxes]);
          return;
        }
        const category = rowSelector === '.home-category-sort-row';
        const items = category ? page.categories : page.categories[Number(rowSelector.match(/#section-(\d+)/)[1])].recipes;
        const rows = items.map(({ id }, index) => ({
          dataset: { sortId: id },
          ...(category ? { top: 112 + index * 75, bottom: 174 + index * 75 } : recipeBoxes[index]),
        }));
        const results = category
          ? [viewports.category, { scrollTop: 0, scrollHeight: 320 }, rows]
          : [viewports.recipe, recipePosition, rows, sectionBoxes[0]];
        if (deferMeasure) queueMicrotask(() => callback(results));
        else callback(results);
      },
    };
    return query;
  };

  const requests = [];
  const notices = [];
  const respond = (request, statusCode = 200, data = null) => request.success({ statusCode, data: { code: statusCode === 200 ? 0 : statusCode, data } });
  Object.assign(global.wx, {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    showToast: ({ title }) => notices.push(title),
    request: (request) => requests.push(request),
  });
  const start = (kind, id, x, y, categoryId) => page.startHomeDrag({ kind, id, categoryId, point: { x, y } });
  return { page, requests, notices, respond, start };
}

test('home touch handling lets regular taps and swipes pass and consumes an accepted long press', () => {
  const state = {};
  const calls = [];
  const owner = { getState: () => state, callMethod: (name, input) => calls.push({ name, input }) };
  const dataset = { kind: 'recipe', id: 'r1', categoryId: 'a', canDrag: true };
  const handle = (name, clientX = 160, clientY = 180) => homeGestures[name]({
    currentTarget: { dataset }, touches: [{ clientX, clientY }], changedTouches: [{ clientX, clientY }],
  }, owner);
  handle('start');
  handle('end');
  handle('tap');
  assert.equal(calls.at(-1).name, 'tapHomeItem');

  calls.length = 0;
  handle('start');
  assert.equal(handle('move', 125), undefined);
  assert.equal(handle('hold', 125), undefined);
  assert.deepEqual(calls, []);

  handle('start');
  assert.equal(handle('hold'), false);
  assert.deepEqual(calls[0].input, { kind: 'recipe', id: 'r1', categoryId: 'a', point: { x: 160, y: 180 } });
  assert.equal(handle('move', 160, 260), false);
  assert.equal(handle('end', 160, 260), false);
  assert.equal(handle('tap'), false);
  assert.deepEqual(calls.map(({ name }) => name), ['startHomeDrag', 'moveHomeDrag', 'finishHomeDrag']);
});

test('homepage moves categories in both directions and keeps the selected category by ID', async () => {
  const { page, requests, respond, start } = mockHomeOrder();
  page.setData({ activeIndex: 1 });
  start('category', 'a', 40, 142);
  page.onCatalogScroll({ detail: { scrollTop: 0 } });
  assert.equal(page.data.activeIndex, 1);
  const first = page.finishHomeDrag({ x: 40, y: 296 });
  await Promise.resolve();
  assert.equal(page.data.homeOrderSaving, true);
  assert.deepEqual(page.data.visibleCategories.map(({ id }) => id), ['b', 'c', 'a']);
  assert.equal(page.data.visibleCategories[page.data.activeIndex].id, 'b');
  assert.equal(page.data.homeRecipeScrollTop, 0);
  assert.equal(requests[0].method, 'PUT');
  assert.match(requests[0].url, /\/categories\/order\/batch$/);
  assert.deepEqual(requests[0].data, { ids: ['b', 'c', 'a'], expectedIds: ['a', 'b', 'c'] });
  start('category', 'b', 40, 142);
  await page.refreshFromGesture();
  assert.equal(page.homeDrag, null);
  assert.equal(requests.length, 1);
  respond(requests[0]);
  await first;

  start('category', 'a', 40, 292);
  const second = page.finishHomeDrag({ x: 40, y: 132 });
  await Promise.resolve();
  assert.deepEqual(requests[1].data, { ids: ['a', 'b', 'c'], expectedIds: ['b', 'c', 'a'] });
  respond(requests[1]);
  await second;
  assert.equal(page.data.visibleCategories[page.data.activeIndex].id, 'b');
  assert.equal(page.data.homeRecipeScrollTop, 265);
  assert.equal(page.data.homeOrderSaving, false);
});

test('homepage recipe drops use actual row heights and cancel outside the original category', async () => {
  const { page, requests, respond, start } = mockHomeOrder({ deferMeasure: true });
  start('recipe', 'r1', 155, 160, 'a');
  await page.finishHomeDrag({ x: 155, y: 390 });
  start('recipe', 'r1', 155, 160, 'a');
  await page.finishHomeDrag({ x: 35, y: 280 });
  start('recipe', 'r1', 155, 160, 'a');
  await page.finishHomeDrag({ x: 155, y: 160 });
  assert.equal(requests.length, 0);

  page.setData({ query: 'r1' });
  start('recipe', 'r1', 155, 160, 'a');
  assert.equal(page.homeDrag, null);
  page.clearSearch();
  start('recipe', 'r1', 155, 160, 'a');
  const save = page.finishHomeDrag({ x: 155, y: 242 });
  await new Promise(setImmediate);
  assert.match(requests[0].url, /\/categories\/a\/recipes\/order$/);
  assert.deepEqual(requests[0].data, { ids: ['r2', 'r1', 'r3'], expectedIds: ['r1', 'r2', 'r3'] });
  respond(requests[0]);
  await save;
  assert.deepEqual(page.categories[1].recipes.map(({ id }) => id), ['r4']);
});

test('homepage edge autoscroll stops at the end of the active recipe group', (t) => {
  let tick;
  t.mock.method(global, 'setInterval', (callback) => { tick = callback; });
  t.mock.method(global, 'clearInterval', () => {});
  const { page, requests, start } = mockHomeOrder({ recipeViewportBottom: 280 });
  const scrolls = [];
  const setData = page.setData;
  page.setData = (patch, callback) => {
    setData(patch, callback);
    if (Number.isFinite(patch.homeRecipeScrollTop)) {
      scrolls.push(patch.homeRecipeScrollTop);
      page.onCatalogScroll({ detail: { scrollTop: patch.homeRecipeScrollTop } });
    }
  };
  start('recipe', 'r1', 155, 160, 'a');
  page.moveHomeDrag({ x: 155, y: 275 });
  for (let index = 0; index < 25; index += 1) tick();
  assert.equal(scrolls.at(-1), 72);
  assert.equal(page.data.homeDropId, 'r3');
  page.onHide();
  assert.equal(page.homeDrag, null);
  assert.equal(page.data.homeDragOffset, 0);
  assert.equal(requests.length, 0);
});

test('homepage reverts a failed sort and uses the authoritative order after conflict or timeout', async () => {
  for (const failure of ['conflict', 'timeout']) {
    const { page, requests, respond, notices, start } = mockHomeOrder();
    const previous = page.categories;
    start('category', 'a', 40, 142);
    const save = page.finishHomeDrag({ x: 40, y: 295 });
    await Promise.resolve();
    if (failure === 'conflict') respond(requests[0], 409);
    else requests[0].fail({ errMsg: 'timeout' });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(page.categories, previous);
    assert.equal(page.data.homeOrderSaving, true);
    assert.equal(requests[1].method, 'GET');
    respond(requests[1], 200, [previous[2], previous[0], previous[1]]);
    await save;
    assert.deepEqual(page.data.visibleCategories.map(({ id }) => id), ['c', 'a', 'b']);
    assert.equal(page.data.homeOrderSaving, false);
    assert.equal(notices.length, 1);
  }
});

test('cart stores a stable checkout snapshot through retry and resets only after acceptance', () => {
  mockCartStorage();
  cart.replaceQuantity('recipe:B', 5);
  cart.replaceQuantity('recipe:A', 2);
  const first = cart.prepareOrder();
  assert.deepEqual(first.items, [{ recipeId: 'recipe:A', quantity: 2 }, { recipeId: 'recipe:B', quantity: 5 }]);
  assert.match(first.requestId, /^[A-Za-z0-9._-]+$/);

  delete require.cache[require.resolve('../lib/cart')];
  const relaunchedCart = require('../lib/cart');
  assert.deepEqual(relaunchedCart.prepareOrder(), first);
  assert.throws(() => relaunchedCart.replaceQuantity('recipe:A', 1), /上一次/);
  assert.throws(() => relaunchedCart.clear(), /上一次/);
  relaunchedCart.acceptOrder('unrelated');
  assert.deepEqual(relaunchedCart.read().items, first.items);
  relaunchedCart.acceptOrder(first.requestId);
  assert.deepEqual(relaunchedCart.read(), { pending: null, items: [] });
});

test('an explicitly rejected order keeps selected items editable', () => {
  mockCartStorage();
  cart.replaceQuantity('one', 2);
  const first = cart.prepareOrder();
  cart.clearPending(first.requestId);
  cart.replaceQuantity('one', 1);
  const retry = cart.prepareOrder();
  assert.notEqual(first.requestId, retry.requestId);
  assert.deepEqual(retry.items, [{ recipeId: 'one', quantity: 1 }]);
});

test('request handles HTTP 201, preserves ambiguous failure, and validates HTTP and business statuses', async () => {
  let response;
  const requests = [];
  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    request: (options) => {
      requests.push(options);
      options.success(response);
    },
  };

  response = { statusCode: 201, data: { code: 0, data: { id: 'order:test' } } };
  assert.deepEqual(await api.createOrder({ requestId: 'test' }), { id: 'order:test' });
  response = { statusCode: 200, data: { code: 0, data: null } };
  await api.deleteOrder('order:test');
  assert.equal(requests.at(-1).url, 'http://127.0.0.1:8080/api/orders/order%3Atest');

  response = { statusCode: 503, data: { code: 0, data: null } };
  await assert.rejects(api.getCategories(), { status: 503, definitive: false });
  response = { statusCode: 404, data: { code: 404, message: '菜谱不存在' } };
  await assert.rejects(api.getRecipe('invalid'), { message: '菜谱不存在', status: 404, definitive: true });
  response = { statusCode: 404, data: '<html>Gateway error</html>' };
  await assert.rejects(api.getOrders(), { status: 404, definitive: false });
  response = { statusCode: 200, data: { code: 1, message: '操作失败' } };
  await assert.rejects(api.getCategories(), { message: '操作失败', status: 200, definitive: false });

  global.wx.request = (options) => options.fail({ errMsg: 'timeout' });
  await assert.rejects(api.getOrders(), /网络连接失败/);
});

test('upload parses multipart response and normalizes image paths separately from API paths', async () => {
  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    uploadFile: (options) => {
      assert.equal(options.url, 'http://127.0.0.1:8080/api/images');
      assert.equal(options.name, 'file');
      options.success({ statusCode: 201, data: '{"code":0,"data":{"path":"/static/images/market/test.jpg"}}' });
    },
  };

  const path = await api.uploadImage('wxfile://picked.jpg');
  assert.equal(api.mediaUrl(path), 'http://127.0.0.1:8080/static/images/market/test.jpg');
  assert.equal(api.mediaUrl('https://example.test/legacy.png'), 'https://example.test/legacy.png');
  assert.equal(api.mediaUrl('//example.test/legacy.png'), '');
});

test('trial and release use the deployed HTTPS API', async () => {
  for (const envVersion of ['trial', 'release']) {
    global.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
      request: (options) => {
        assert.equal(options.url, 'https://cookbook.caowj.top/api/categories');
        options.success({ statusCode: 200, data: { code: 0, data: [] } });
      },
    };
    assert.deepEqual(await api.getCategories(), []);
  }
});

test('home reviews the cart before submitting and reuses the last request after a timeout', async () => {
  mockCartStorage();
  cart.replaceQuantity('recipe:one', 2);
  const requests = [];
  const tabs = [];
  Object.assign(global.wx, {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    request: (request) => {
      requests.push(request.data);
      if (requests.length === 1) request.fail({ errMsg: 'timeout' });
      else request.success({ statusCode: 201, data: { code: 0, data: { id: 'order:new' } } });
    },
    showToast: () => {},
    switchTab: (options) => tabs.push(options.url),
  });

  const page = mockHomePage();
  await page.submitOrder();
  page.openCart();
  assert.equal(page.data.cartOpen, true);
  assert.equal(cart.read().pending, null);
  assert.deepEqual(requests, []);

  await page.submitOrder();
  assert.equal(page.data.cartPending, true);
  assert.equal(page.data.totalQuantity, 2);
  assert.deepEqual(tabs, []);

  page.closeCart();
  page.openCart();
  await page.submitOrder();
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(page.data.totalQuantity, 0);
  assert.deepEqual(tabs, ['/pages/order/order']);
});

test('clearing the cart requires confirmation and cancellation preserves selected items', async () => {
  mockCartStorage();
  cart.replaceQuantity('recipe:one', 2);
  const dialogs = [];
  global.wx.showModal = (options) => dialogs.push(options);
  const page = mockHomePage();
  page.openCart();

  const canceled = page.clearCart();
  await page.clearCart();
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].confirmText, '清空');
  assert.equal(page.data.totalQuantity, 2);
  dialogs[0].success({ confirm: false });
  await canceled;
  assert.equal(page.data.cartOpen, true);
  assert.equal(cart.read().items[0].quantity, 2);

  const confirmed = page.clearCart();
  dialogs[1].success({ confirm: true });
  await confirmed;
  assert.deepEqual(cart.read().items, []);
  assert.equal(page.data.totalQuantity, 0);
  assert.equal(page.data.cartOpen, false);
});

test('recipe details add a serving to the shared cart and preserve the edit route', async () => {
  mockCartStorage();
  const requests = [];
  const toasts = [];
  const routes = [];
  Object.assign(global.wx, {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    request: (request) => {
      requests.push(request.method);
      request.success({ statusCode: 200, data: { code: 0, data: { id: 'recipe:one', name: '番茄炒蛋' } } });
    },
    showToast: (options) => toasts.push(options.title),
    navigateTo: (options) => routes.push(options.url),
  });
  cart.replaceQuantity('recipe:one', 2);
  const detail = mockPage('../packages/catalog/recipe/detail');
  detail.onLoad({ recipeId: 'recipe:one' });
  detail.addToCart();
  assert.equal(cart.read().items[0].quantity, 2);
  await detail.loadRecipe();
  detail.addToCart();
  assert.equal(toasts.at(-1), '已加入购物车');
  assert.equal(mockHomePage().data.totalQuantity, 3);
  assert.equal(cart.read().pending, null);
  assert.deepEqual(requests, ['GET']);

  const pending = cart.prepareOrder();
  detail.addToCart();
  assert.match(toasts.at(-1), /上一次/);
  assert.equal(cart.read().items[0].quantity, 3);
  assert.deepEqual(cart.read().pending, pending);

  cart.clearPending(pending.requestId);
  cart.replaceQuantity('recipe:one', 9999);
  detail.addToCart();
  assert.equal(toasts.at(-1), '这道菜已达到数量上限');
  assert.equal(cart.read().items[0].quantity, 9999);

  detail.editRecipe();
  assert.deepEqual(routes, ['/packages/catalog/recipe/editor?recipeId=recipe%3Aone']);
});

function mockCardGeometry(page) {
  page.createSelectorQuery = () => {
    const selectors = [];
    const query = {
      selectAll: (selector) => { selectors.push(selector); return query; },
      select: (selector) => { selectors.push(selector); return query; },
      boundingClientRect: () => query,
      exec: (callback) => {
        assert.deepEqual(selectors, ['.card-order-row', '.card-order-page', '.card-order-footer']);
        callback([[{ top: 50 }, { top: 150 }], { height: 620 }, { top: 558 }]);
      },
    };
    return query;
  };
}

function mockCardGesture(page) {
  const state = {};
  let result;
  const owner = {
    getState: () => state,
    callMethod: (name, data) => { result = page[name](data); },
  };
  const currentTarget = { dataset: { index: '0', canDrag: true } };
  const point = (clientY) => [{ clientY }];
  return {
    start(y) { cardGestures.touchStart({ currentTarget, touches: point(y) }, owner); },
    hold() { return cardGestures.holdCard({ currentTarget }, owner); },
    move(y) { return cardGestures.moveCard({ currentTarget, touches: point(y) }, owner); },
    cancel() { cardGestures.touchCancel({ currentTarget }, owner); },
    async end(y) {
      const handled = cardGestures.touchEnd({ currentTarget, changedTouches: point(y) }, owner);
      if (handled === false) await result;
      return handled;
    },
  };
}

test('dragging a category card saves on release and restores the menu after a rejected save', async () => {
  let categories = ['a', 'b', 'c'].map((id) => ({ id, name: id, recipes: [] }));
  const writes = [];
  let reject = false;
  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    getWindowInfo: () => ({ windowHeight: 620 }),
    showToast: () => {},
    request: (request) => {
      if (request.method === 'GET') {
        request.success({ statusCode: 200, data: { code: 0, data: categories } });
      } else {
        writes.push(request.data);
        if (reject) {
          request.success({ statusCode: 409, data: { code: 409, message: '顺序已变化' } });
          return;
        }
        const byId = new Map(categories.map((category) => [category.id, category]));
        categories = request.data.ids.map((id) => byId.get(id));
        request.success({ statusCode: 200, data: { code: 0, data: null } });
      }
    },
  };
  const page = mockPage('../packages/catalog/category/manage');
  mockCardGeometry(page);
  await page.loadCategories();
  const gesture = mockCardGesture(page);
  const dragFirst = () => {
    gesture.start('70');
    assert.equal(gesture.hold(), false);
    assert.equal(gesture.move(270), false);
  };

  try {
    gesture.start(70);
    assert.equal(gesture.move(270), undefined);
    assert.equal(await gesture.end(270), undefined);
    assert.equal(page.data.dragIndex, -1);
    assert.equal(writes.length, 0);

    dragFirst();
    assert.equal(page.data.dragTarget, 2);
    assert.equal(writes.length, 0);
    gesture.cancel();
    await gesture.end(270);
    assert.equal(writes.length, 0);

    dragFirst();
    await gesture.end(270);
    assert.deepEqual(writes[0], { ids: ['b', 'c', 'a'], expectedIds: ['a', 'b', 'c'] });
    assert.deepEqual(page.data.categories.map(({ id }) => id), ['b', 'c', 'a']);

    reject = true;
    dragFirst();
    await gesture.end(270);
    assert.equal(writes.length, 2);
    assert.deepEqual(page.data.categories.map(({ id }) => id), ['b', 'c', 'a']);
    assert.equal(page.data.orderSaving, false);
    assert.equal(page.data.dragIndex, -1);
  } finally {
    page.onUnload();
  }
});
