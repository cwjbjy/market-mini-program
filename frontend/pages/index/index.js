const api = require('../../lib/api');
const cart = require('../../lib/cart');
const { filterCategories } = require('../../lib/search');
const { confirm, toast, showError, errorMessage } = require('../../lib/ui');
const order = require('./home-order');
const wheel = require('../../lib/wheel');
const history = require('../../lib/order-history');
const { createWheelRenderer } = require('./wheel-canvas');

const SPIN_DURATION = 3100;
const closedWheel = {
  wheelOpen: false, wheelItems: [], wheelNames: '', wheelPick: 0,
  wheelSpinning: false, wheelResult: null, wheelCanShuffle: false, wheelCanvasReady: false, wheelCanvasFailed: false,
  wheelHistoryUnloaded: false, wheelMenuUnavailable: false,
};

Page({
  data: {
    ...order.dragData,
    query: '',
    recipeCount: 0,
    heroTop: 72,
    visibleCategories: [],
    activeIndex: 0,
    categoryAnchor: '',
    animateCatalogScroll: true,
    refreshing: false,
    loading: true,
    loadError: '',
    cartOpen: false,
    wheelReady: false,
    ...closedWheel,
    cartItems: [],
    totalQuantity: 0,
    cartPending: false,
    submitting: false,
  },

  onLoad() {
    this.categories = [];
    this.sections = [];
    this.catalogScrollPosition = { scrollTop: 0 };
    this.searchKeyword = '';
    this.updateHeroTop();
  },

  onShow() {
    this.homeHidden = false;
    this.getTabBar?.()?.setData({ selected: 'home' });
    if (this.data.homeOrderSaving) {
      this.refreshAfterHomeOrder = true;
      return;
    }
    this.renderCatalog();
    if (this.wheelBatch) this.prepareWheel();
    this.refreshCatalog();
  },

  onHide() {
    this.homeHidden = true;
    order.cancel(this);
    this.closeWheel();
  },

  onUnload() {
    clearTimeout(this.searchTimer);
    clearTimeout(this.wheelPreparationTimer);
    this.unloaded = true;
    this.closeWheel();
    this.sectionQuery = null;
    this.catalogJump = null;
    order.cancel(this);
  },

  onResize() {
    order.cancel(this);
    this.updateHeroTop();
    this.measureSections();
    if (this.wheelSession && this.data.wheelItems.length === wheel.SIZE) this.paintWheel();
  },

  updateHeroTop() {
    const capsule = wx.getMenuButtonBoundingClientRect?.();
    const statusBarHeight = wx.getWindowInfo?.()?.statusBarHeight || 0;
    this.setData({ heroTop: capsule?.bottom > 0 ? capsule.bottom + 4 : statusBarHeight + 48 });
  },

  async refreshCatalog() {
    if (this.homeDrag || this.data.homeOrderSaving || this.unloaded) return;
    if (this.refreshTask) return this.refreshTask;
    this.refreshTask = this.fetchCatalog();
    try {
      await this.refreshTask;
    } finally {
      this.refreshTask = null;
      if (!this.unloaded) {
        this.setData({ loading: false, refreshing: false }, () => {
          if (this.unloaded) return;
          clearTimeout(this.wheelPreparationTimer);
          this.wheelPreparationTimer = setTimeout(() => this.prepareWheel(), 0);
        });
      }
    }
  },

  async fetchCatalog(alignCategory = false) {
    try {
      const categories = await api.getCategories();
      if (this.unloaded) return;
      this.categories = categories;
      this.catalogLoaded = true;
      this.setData({ loadError: '' });
      this.renderCatalog(false, true, { alignCategory });
    } catch (error) {
      if (!this.unloaded) this.setData({ loadError: errorMessage(error, '无法加载菜单') });
    }
  },

  refreshFromGesture() {
    if (this.homeDrag || this.data.homeOrderSaving) return;
    this.setData({ refreshing: true });
    return this.refreshCatalog();
  },

  renderCatalog(resetIndex = false, measure = false, { alignCategory = false, selectedCategoryId } = {}) {
    const { items, pending } = cart.read();
    const quantities = new Map(items.map((item) => [item.recipeId, item.quantity]));
    const recipeIndex = new Map();
    const categories = this.categories.map((category) => ({
      ...category,
      imageUrl: api.mediaUrl(category.image),
      recipes: category.recipes.map((recipe) => {
        const item = { ...recipe, quantity: quantities.get(recipe.id) || 0, imageUrl: api.mediaUrl(recipe.image) };
        recipeIndex.set(item.id, item);
        return item;
      }),
    }));
    const visibleCategories = filterCategories(categories, this.searchKeyword);
    const cartItems = items.map(({ recipeId, quantity }) => recipeIndex.get(recipeId)
      || {
        id: recipeId,
        quantity,
        name: this.catalogLoaded ? '菜谱已不可用' : '已选菜谱',
        unavailable: Boolean(this.catalogLoaded),
      });
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const selectedId = selectedCategoryId ?? this.data.visibleCategories[this.data.activeIndex]?.id;
    const selectedIndex = selectedId === undefined ? 0 : visibleCategories.findIndex((category) => category.id === selectedId);
    const activeIndex = resetIndex ? 0 : Math.max(0, selectedIndex);
    const resetPosition = resetIndex || selectedIndex < 0 || alignCategory || (measure && this.catalogJump);
    const jump = resetPosition && visibleCategories.length ? { index: activeIndex } : null;
    if (resetPosition) this.catalogJump = jump;
    if (measure) {
      this.sections = [];
      this.sectionQuery = null;
    }
    this.setData({
      ...(resetPosition ? { animateCatalogScroll: !alignCategory } : {}),
      recipeCount: recipeIndex.size,
      visibleCategories,
      activeIndex,
      categoryAnchor: 'category-' + activeIndex,
      cartItems,
      totalQuantity,
      cartPending: Boolean(pending),
      cartOpen: Boolean(items.length) && this.data.cartOpen,
    }, () => {
      if (jump) this.applyCatalogJump(jump);
      if (measure && !this.unloaded) this.measureSections();
    });
  },

  onSearchInput(event) {
    order.cancel(this);
    const query = event.detail.value;
    this.setData({ query });
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applySearch(query), 300);
  },

  onSearchConfirm(event) {
    clearTimeout(this.searchTimer);
    this.setData({ query: event.detail.value });
    this.applySearch(event.detail.value);
  },

  clearSearch() {
    clearTimeout(this.searchTimer);
    this.setData({ query: '' });
    this.applySearch('');
  },

  applySearch(query) {
    order.cancel(this);
    this.searchKeyword = query;
    this.renderCatalog(true, true);
  },

  measureSections() {
    const query = this.createSelectorQuery();
    const previousPosition = this.catalogScrollPosition;
    this.sectionQuery = query;
    query.select('.catalog-scroll').boundingClientRect();
    query.select('.catalog-scroll').scrollOffset();
    query.selectAll('.catalog-section').boundingClientRect();
    query.exec(([area, position, sections]) => {
      if (this.sectionQuery !== query) return;
      this.sectionQuery = null;
      if (!area || !position || !sections) {
        this.sections = [];
        return;
      }
      this.catalogViewportHeight = area.height;
      this.sections = sections.map((section) => section.top - area.top + position.scrollTop);
      if (this.catalogScrollPosition === previousPosition) this.catalogScrollPosition = position;
      if (this.catalogJump) this.applyCatalogJump(this.catalogJump);
      this.finishCatalogJump();
    });
  },

  tapHomeItem({ kind, id }) {
    if (this.homeDrag) return;
    if (kind === 'recipe') {
      wx.navigateTo({ url: '/packages/catalog/recipe/detail?recipeId=' + encodeURIComponent(id) });
      return;
    }
    const index = this.data.visibleCategories.findIndex((category) => category.id === id);
    if (index < 0) return;
    const jump = { index };
    this.catalogJump = jump;
    this.setData({ activeIndex: index, categoryAnchor: 'category-' + index, animateCatalogScroll: true }, () => {
      if (this.catalogJump === jump) this.measureSections();
    });
  },

  startHomeDrag(item) {
    order.start(this, item);
  },

  moveHomeDrag(point) {
    order.move(this, point);
  },

  finishHomeDrag(point) {
    return order.finish(this, point);
  },

  cancelHomeDrag() {
    order.cancel(this);
  },

  onSidebarScroll(event) {
    order.onScroll(this, 'category', event.detail.scrollTop);
  },

  catalogTarget(index) {
    const { scrollHeight } = this.catalogScrollPosition;
    const max = scrollHeight - this.catalogViewportHeight;
    const sectionTop = this.sections[index];
    return Number.isFinite(max) ? Math.min(sectionTop, Math.max(0, max)) : sectionTop;
  },

  applyCatalogJump(jump) {
    if (this.catalogJump !== jump || jump.commanded) return;
    const target = this.catalogTarget(jump.index);
    if (!Number.isFinite(target)) return;
    jump.commanded = true;
    const current = this.catalogScrollPosition.scrollTop;
    if (this.data.homeRecipeScrollTop === target && Math.abs(current - target) <= 2) {
      this.catalogJump = null;
      return;
    }
    const issue = () => {
      if (this.catalogJump !== jump) return;
      this.setData({ homeRecipeScrollTop: target }, () => {
        if (this.catalogJump !== jump) return;
        jump.applied = true;
        this.finishCatalogJump();
      });
    };
    // The scroll view ignores a request if its last bound value already equals the target.
    if (this.data.homeRecipeScrollTop === target) this.setData({ homeRecipeScrollTop: current }, issue);
    else issue();
  },

  finishCatalogJump() {
    const jump = this.catalogJump;
    if (!jump?.applied) return;
    if (Math.abs(this.catalogScrollPosition.scrollTop - this.catalogTarget(jump.index)) <= 2) this.catalogJump = null;
  },

  onCatalogDrag(event) {
    if (this.homeDrag || !this.catalogJump) return;
    this.catalogJump = null;
    if (Number.isFinite(event.detail?.scrollTop)) this.onCatalogScroll(event);
  },

  onCatalogScroll(event) {
    this.catalogScrollPosition = event.detail;
    order.onScroll(this, 'recipe', event.detail.scrollTop);
    if (this.homeDrag || this.sections.length === 0) return;
    if (this.catalogJump) {
      this.finishCatalogJump();
      return;
    }
    const top = event.detail.scrollTop + 18;
    let index = 0;
    while (index + 1 < this.sections.length && this.sections[index + 1] <= top) index += 1;
    if (index !== this.data.activeIndex) {
      this.setData({ activeIndex: index, categoryAnchor: 'category-' + index });
    }
  },

  createRecipe() {
    if (this.homeDrag || this.data.homeOrderSaving) return;
    const category = this.data.visibleCategories[this.data.activeIndex];
    const query = category ? '?categoryId=' + encodeURIComponent(category.id) : '';
    wx.navigateTo({ url: '/packages/catalog/recipe/editor' + query });
  },

  manageCategories() {
    if (this.homeDrag || this.data.homeOrderSaving) return;
    wx.navigateTo({ url: '/packages/catalog/category/manage' });
  },

  adjustQuantity(event) {
    if (this.homeDrag || this.data.submitting || this.data.cartPending) return;
    const { id, delta } = event.currentTarget.dataset;
    try {
      cart.adjustQuantity(id, Number(delta));
      this.renderCatalog();
    } catch (error) {
      showError(error, '无法保存购物车');
    }
  },

  discardUnavailable(event) {
    try {
      cart.replaceQuantity(event.currentTarget.dataset.id, 0);
      this.renderCatalog();
    } catch (error) {
      showError(error, '无法移除菜谱');
    }
  },

  async removeRecipe(event) {
    const { id, name } = event.currentTarget.dataset;
    if (this.deletingRecipe || this.homeDrag || this.data.homeOrderSaving) return;
    this.deletingRecipe = true;
    try {
      if (!await confirm('删除菜谱', '确定删除「' + name + '」吗？')) return;
      await api.deleteRecipe(id);
      if (!cart.read().pending) cart.replaceQuantity(id, 0);
      toast('菜谱已删除', 'success');
      await this.refreshTask;
      await this.refreshCatalog();
    } catch (error) {
      showError(error, '删除失败');
    } finally {
      this.deletingRecipe = false;
    }
  },

  prepareWheel() {
    if (this.unloaded) return;
    const orders = history.getLoadedOrders();
    if (this.wheelOrders !== orders) {
      this.wheelOrders = orders;
      this.wheelLatest = wheel.lastEatenByRecipe(orders || []);
    }
    const recipes = this.categories.flatMap((category) => category.recipes);
    const pools = wheel.buildPools(recipes, this.wheelLatest);
    const recentKey = JSON.stringify(pools.recent.map(({ id }) => id));
    const cached = this.wheelBatch;
    const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const current = cached?.items.map(({ id }) => byId.get(id));
    if (recentKey === this.wheelRecentKey && current?.length === Math.min(recipes.length, wheel.SIZE) && current.every(Boolean)) {
      this.wheelBatch = { ...cached, items: current, recipeCount: recipes.length };
    } else {
      const items = wheel.sampleWheel(pools);
      const pick = items.length < wheel.SIZE && pools.fresh.length ? Math.floor(Math.random() * pools.fresh.length) : 0;
      this.wheelBatch = { items, pick, recipeCount: recipes.length };
      this.wheelRecentKey = recentKey;
    }
    if (!this.data.wheelReady) this.setData({ wheelReady: true });
  },

  openWheel() {
    if (!this.wheelBatch || this.homeDrag || this.data.homeOrderSaving || this.data.submitting || this.data.cartOpen || this.data.wheelOpen) return;
    if (this.wheelOrders !== history.getLoadedOrders()) this.prepareWheel();
    const batch = this.wheelBatch;
    this.wheelSession = { angle: 0 };
    this.showWheelBatch(batch, {
      ...closedWheel,
      wheelOpen: true,
      wheelHistoryUnloaded: this.wheelOrders === null,
      wheelMenuUnavailable: !this.catalogLoaded && Boolean(this.data.loadError),
    });
  },

  closeWheel() {
    this.wheelSession = null;
    clearTimeout(this.wheelSpinTimer);
    clearTimeout(this.wheelCanvasTimer);
    if (this.data.wheelOpen && !this.unloaded) this.setData(closedWheel);
  },

  onWheelVisibility(event) {
    if (!event.detail.visible) this.closeWheel();
  },

  showWheelBatch({ items, pick, recipeCount }, patch = {}) {
    this.wheelSession.angle = 0;
    this.setData({
      ...patch,
      wheelItems: items.map(({ id, name, image }) => ({ id, name, imageUrl: api.mediaUrl(image) })),
      wheelNames: items.map(({ name }) => name).join('、'),
      wheelPick: pick, wheelResult: null, wheelCanvasReady: false, wheelCanvasFailed: false,
      wheelCanShuffle: items.length < wheel.SIZE ? items.length > 1 : recipeCount > wheel.SIZE,
    }, () => {
      if (items.length === wheel.SIZE) this.paintWheel();
    });
  },

  paintWheel() {
    const session = this.wheelSession;
    if (!session || typeof this.createSelectorQuery !== 'function') return;
    clearTimeout(this.wheelCanvasTimer);
    const revision = {};
    session.paint = revision;
    const attempt = (remaining) => {
      const query = this.createSelectorQuery();
      query.select('#dinner-wheel-canvas').fields({ node: true, size: true });
      query.exec(([result]) => {
        if (this.wheelSession !== session || session.paint !== revision) return;
        if (result?.node && result.width > 0) {
          const ratio = Math.min(3, wx.getWindowInfo?.()?.pixelRatio || 1);
          session.draw = createWheelRenderer(result.node, result.width, ratio, this.data.wheelItems);
          session.draw?.(session.angle);
          this.setData({ wheelCanvasReady: Boolean(session.draw), wheelCanvasFailed: !session.draw });
        } else if (remaining) {
          this.wheelCanvasTimer = setTimeout(() => attempt(remaining - 1), 65);
        } else {
          this.setData({ wheelCanvasFailed: true });
        }
      });
    };
    attempt(6);
  },

  reshuffleDinner() {
    const { wheelItems, wheelPick, wheelCanShuffle, wheelSpinning } = this.data;
    if (!this.wheelSession || !wheelCanShuffle || wheelSpinning) return;
    if (wheelItems.length < wheel.SIZE) {
      const pick = (wheelPick + 1) % wheelItems.length;
      this.wheelBatch = { ...this.wheelBatch, pick };
      this.setData({ wheelPick: pick });
      return;
    }
    const recipes = this.categories.flatMap((category) => category.recipes);
    const pools = wheel.buildPools(recipes, this.wheelLatest || new Map());
    const items = wheel.reshuffleWheel(pools, wheelItems);
    this.wheelBatch = { items, pick: 0, recipeCount: recipes.length };
    this.showWheelBatch(this.wheelBatch);
  },

  spinDinner() {
    const session = this.wheelSession;
    const { wheelItems, wheelSpinning, wheelCanvasReady, wheelCanvasFailed, cartPending, submitting } = this.data;
    if (!session || wheelItems.length !== wheel.SIZE || wheelSpinning || cartPending || submitting) return;
    if (wheelCanvasFailed) {
      this.setData({ wheelResult: wheelItems[Math.floor(Math.random() * wheel.SIZE)] });
      return;
    }
    if (!wheelCanvasReady) return;
    const startAngle = session.angle;
    const angle = Math.floor(startAngle / 360) * 360 + wheel.spinAngle(Math.floor(Math.random() * wheel.SIZE));
    this.setData({ wheelSpinning: true });
    const started = Date.now();
    const frame = () => {
      if (this.wheelSession !== session || !this.data.wheelSpinning) return;
      const progress = Math.max(0, Math.min(1, (Date.now() - started) / SPIN_DURATION));
      session.angle = startAngle + (angle - startAngle) * (1 - (1 - progress) ** 3);
      session.draw?.(session.angle);
      if (progress === 1) this.setData({ wheelSpinning: false, wheelResult: wheelItems[wheel.winnerIndex(angle)] });
      else this.wheelSpinTimer = setTimeout(frame, 16);
    };
    frame();
  },

  confirmWheelDish() {
    const { wheelResult, wheelItems, wheelPick, wheelSpinning, cartPending, submitting } = this.data;
    if (!this.wheelSession || wheelSpinning || cartPending || submitting) return;
    const dish = wheelResult || (wheelItems.length < wheel.SIZE ? wheelItems[wheelPick] : null);
    if (!dish) return;
    const { id, name } = dish;
    try {
      if (!cart.adjustQuantity(id, 1)) {
        toast('该菜数量已达上限');
        return;
      }
    } catch (error) {
      showError(error, '无法加入购物车');
      return;
    }
    this.closeWheel();
    this.renderCatalog();
    toast('已把「' + name + '」加入购物车', 'success');
  },

  openCart() {
    if (!this.homeDrag && !this.data.wheelOpen && this.data.totalQuantity > 0) this.setData({ cartOpen: true });
  },

  closeCart() {
    if (!this.data.submitting) this.setData({ cartOpen: false });
  },

  onCartVisibility(event) {
    if (!event.detail.visible) this.closeCart();
  },

  async clearCart() {
    if (this.confirmingClear || this.data.submitting || this.data.cartPending || !this.data.cartOpen) return;
    this.confirmingClear = true;
    try {
      if (!await confirm('清空购物车', '确定移除所有已选菜品吗？', '清空')) return;
      cart.clear();
      this.renderCatalog();
    } catch (error) {
      showError(error, '无法清空购物车');
    } finally {
      this.confirmingClear = false;
    }
  },

  async submitOrder() {
    if (!this.data.cartOpen || this.data.submitting || this.confirmingClear) return;
    if (!this.data.cartPending && this.data.cartItems.some((item) => item.unavailable)) {
      toast('请先移除不可用的菜谱');
      this.openCart();
      return;
    }

    let order;
    this.setData({ submitting: true });
    try {
      order = cart.prepareOrder();
      this.renderCatalog();
      await api.createOrder(order);
      history.invalidate();
      cart.acceptOrder(order.requestId);
      this.renderCatalog();
      wx.switchTab({ url: '/pages/order/order' });
    } catch (error) {
      if (order && error.definitive) {
        cart.clearPending(order.requestId);
        this.refreshCatalog();
      }
      this.renderCatalog();
      showError(error, '下单失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
