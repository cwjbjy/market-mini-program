const api = require('../../../lib/api');
const { errorMessage } = require('../../../lib/ui');
const { createCardOrder, dragState } = require('./card-order');

const order = createCardOrder({
  list: 'items',
  save: (data, page) => api.reorderRecipes(page.categoryId, data),
  reload: (page) => page.loadItems(),
});

Page({
  ...order.lifecycle,
  data: { ...dragState, items: [], categoryName: '', loading: true, loadError: '' },

  onLoad(options = {}) {
    this.categoryId = options.categoryId;
    if (!this.categoryId) {
      wx.redirectTo({ url: '/packages/catalog/category/manage' });
      return;
    }
    return this.loadItems();
  },

  async loadItems() {
    if (this.fetching || this.cardDrag || this.data.orderSaving) return;
    this.fetching = true;
    this.setData({ loading: !this.data.items.length, loadError: '' });
    try {
      const categories = await api.getCategories();
      if (this.unloaded) return;
      const category = categories.find((item) => item.id === this.categoryId);
      if (!category) {
        this.setData({ items: [], loadError: '分类不存在' });
        return;
      }
      const items = category.recipes.map(({ id, name, image }) => ({ id, name, imageUrl: api.mediaUrl(image) }));
      this.setData({ items, categoryName: category.name });
    } catch (error) {
      if (!this.unloaded) this.setData({ loadError: errorMessage(error, '无法加载菜谱') });
    } finally {
      this.fetching = false;
      if (!this.unloaded) this.setData({ loading: false });
    }
  },

  startCardDrag(point) {
    order.start(this, point);
  },

  moveCardDrag(point) {
    order.move(this, point);
  },

  finishCardDrag(point) {
    return order.finish(this, point);
  },

  cancelCardDrag() {
    order.cancel(this);
  },
});
