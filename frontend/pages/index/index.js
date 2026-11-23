const api = require('../../lib/api');
const cart = require('../../lib/cart');
const { filterCategories } = require('../../lib/search');
const { confirm, toast, showError, errorMessage } = require('../../lib/ui');

Page({
  data: {
    query: '',
    recipeCount: 0,
    heroTop: 72,
    visibleCategories: [],
    activeIndex: 0,
    categoryAnchor: '',
    recipeAnchor: '',
    refreshing: false,
    loading: true,
    loadError: '',
    cartOpen: false,
    cartItems: [],
    totalQuantity: 0,
    cartPending: false,
    submitting: false,
  },

  onLoad() {
    this.categories = [];
    this.sections = [];
    this.searchKeyword = '';
    this.updateHeroTop();
  },

  onShow() {
    this.getTabBar?.()?.setData({ selected: 'home' });
    this.renderCatalog();
    this.refreshCatalog();
  },

  onUnload() {
    clearTimeout(this.searchTimer);
  },

  onResize() {
    this.updateHeroTop();
    this.measureSections();
  },

  updateHeroTop() {
    const capsule = wx.getMenuButtonBoundingClientRect?.();
    const statusBarHeight = wx.getWindowInfo?.()?.statusBarHeight || 0;
    this.setData({ heroTop: capsule?.bottom > 0 ? capsule.bottom + 4 : statusBarHeight + 48 });
  },

  async refreshCatalog() {
    if (this.refreshTask) return this.refreshTask;
    this.refreshTask = this.fetchCatalog();
    try {
      await this.refreshTask;
    } finally {
      this.refreshTask = null;
      this.setData({ loading: false, refreshing: false });
    }
  },

  async fetchCatalog() {
    try {
      this.categories = await api.getCategories();
      this.catalogLoaded = true;
      this.setData({ loadError: '' });
      this.renderCatalog(false, true);
    } catch (error) {
      this.setData({ loadError: errorMessage(error, '无法加载菜单') });
    }
  },

  refreshFromGesture() {
    this.setData({ refreshing: true });
    return this.refreshCatalog();
  },

  renderCatalog(resetIndex = false, measure = false) {
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
    const previous = this.data.visibleCategories[this.data.activeIndex];
    const previousIndex = previous ? visibleCategories.findIndex((category) => category.id === previous.id) : 0;
    const activeIndex = resetIndex ? 0 : Math.max(0, previousIndex);
    const resetPosition = resetIndex || previousIndex < 0;
    this.setData({
      ...(resetPosition ? { recipeAnchor: '' } : {}),
      recipeCount: recipeIndex.size,
      visibleCategories,
      activeIndex,
      categoryAnchor: 'category-' + activeIndex,
      cartItems,
      totalQuantity,
      cartPending: Boolean(pending),
      cartOpen: Boolean(items.length) && this.data.cartOpen,
    }, () => {
      if (resetPosition && visibleCategories.length) {
        this.scrollLockUntil = Date.now() + 450;
        this.setData({ recipeAnchor: 'section-0' });
      }
      if (measure) this.measureSections();
    });
  },

  onSearchInput(event) {
    const query = event.detail.value;
    this.setData({ query });
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applySearch(query), 300);
  },

  onSearchConfirm(event) {
    clearTimeout(this.searchTimer);
    this.applySearch(event.detail.value);
  },

  clearSearch() {
    clearTimeout(this.searchTimer);
    this.setData({ query: '' });
    this.applySearch('');
  },

  applySearch(query) {
    this.searchKeyword = query;
    this.renderCatalog(true, true);
  },

  measureSections() {
    const query = this.createSelectorQuery();
    query.select('.catalog-scroll').boundingClientRect();
    query.select('.catalog-scroll').scrollOffset();
    query.selectAll('.catalog-section').boundingClientRect();
    query.exec(([area, position, sections]) => {
      if (!area || !position || !sections) {
        this.sections = [];
        return;
      }
      this.sections = sections.map((section) => section.top - area.top + position.scrollTop);
    });
  },

  selectCategory(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.scrollLockUntil = Date.now() + 450;
    const anchor = 'section-' + index;
    this.setData({ activeIndex: index, categoryAnchor: 'category-' + index, recipeAnchor: '' }, () => {
      this.setData({ recipeAnchor: anchor });
    });
  },

  onCatalogScroll(event) {
    if (this.scrollLockUntil > Date.now() || this.sections.length === 0) return;
    const top = event.detail.scrollTop + 18;
    let index = 0;
    while (index + 1 < this.sections.length && this.sections[index + 1] <= top) index += 1;
    if (index !== this.data.activeIndex) {
      this.setData({ activeIndex: index, categoryAnchor: 'category-' + index, recipeAnchor: '' });
    }
  },

  createRecipe() {
    const category = this.data.visibleCategories[this.data.activeIndex];
    const query = category ? '?categoryId=' + encodeURIComponent(category.id) : '';
    wx.navigateTo({ url: '/packages/catalog/recipe/editor' + query });
  },

  manageCategories() {
    wx.navigateTo({ url: '/packages/catalog/category/manage' });
  },

  openRecipe(event) {
    wx.navigateTo({ url: '/packages/catalog/recipe/detail?recipeId=' + encodeURIComponent(event.currentTarget.dataset.id) });
  },

  adjustQuantity(event) {
    if (this.data.submitting || this.data.cartPending) return;
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
    if (this.deletingRecipe) return;
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

  openCart() {
    if (this.data.totalQuantity > 0) this.setData({ cartOpen: true });
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
