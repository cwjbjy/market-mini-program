const api = require('../../lib/api');
const { confirm, toast, showError, errorMessage } = require('../../lib/ui');
const { previewImage } = require('../../lib/images');
const { formatOrder, openOrderPage } = require('../../lib/order-snapshot');
const { removeProgress } = require('../../lib/shopping-progress');
const history = require('../../lib/order-history');

Page({
  data: { orders: [], loading: true, loadError: '', loadingMore: false, moreError: '', nextCursor: null, deletingId: '' },

  onShow() {
    this.getTabBar?.()?.setData({ selected: 'order' });
    if (this.loadedVersion !== history.getVersion()) this.loadOrders();
  },

  async onPullDownRefresh() {
    try {
      await this.loadOrders();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  loadOrders() {
    if (this.fetching) return this.data.loadingMore ? this.fetching.then(() => this.loadOrders()) : this.fetching;
    this.setData({ loading: !this.data.orders.length, loadError: '', moreError: '' });
    return this.startPage();
  },

  onReachBottom() {
    if (!this.data.moreError) return this.loadMore();
  },

  loadMore() {
    const { nextCursor, deletingId } = this.data;
    if (this.fetching || !nextCursor || deletingId) return;
    this.setData({ loadingMore: true, moreError: '' });
    return this.startPage(nextCursor);
  },

  startPage(cursor) {
    this.fetching = this.fetchPage(cursor).finally(() => {
      this.fetching = null;
      this.setData({ loading: false, loadingMore: false });
    });
    return this.fetching;
  },

  async fetchPage(cursor) {
    const version = history.getVersion();
    try {
      const { orders, nextCursor } = await api.getOrderPage(cursor);
      const loaded = cursor ? this.data.orders : [];
      const previousIds = new Set(loaded.map(({ id }) => id));
      const additions = orders.filter(({ id }) => !previousIds.has(id)).map(formatOrder);
      const next = [...loaded, ...additions];
      const patch = { nextCursor, moreError: '' };
      if (cursor) {
        additions.forEach((order, index) => { patch['orders[' + (loaded.length + index) + ']'] = order; });
      } else {
        patch.orders = next;
        patch.loadError = '';
        this.loadedVersion = version;
      }
      history.setLoadedOrders(next);
      this.setData(patch);
    } catch (error) {
      if (cursor) this.setData({ moreError: errorMessage(error, '无法加载更多订单') });
      else this.setData({ loadError: errorMessage(error, '无法加载订单') });
    }
  },

  showImage(event) {
    previewImage(event.currentTarget.dataset.url);
  },

  openOrder(event) {
    const { id } = event.currentTarget.dataset;
    if (this.data.deletingId === id) return;
    const order = this.data.orders.find((item) => item.id === id);
    if (order) openOrderPage('/packages/orders/detail/index', order);
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  async removeOrder(event) {
    const { id } = event.currentTarget.dataset;
    if (this.data.deletingId) return;
    this.setData({ deletingId: id });
    try {
      if (!await confirm('删除订单', '确定从订单记录中删除这笔订单吗？')) return;
      await api.deleteOrder(id);
      await this.fetching;
      const orders = this.data.orders.filter((order) => order.id !== id);
      history.setLoadedOrders(orders);
      this.setData({ orders });
      try {
        removeProgress(id);
        toast('订单已删除', 'success');
      } catch {
        toast('订单已删除，本地进度清理失败');
      }
      if (!orders.length && this.data.nextCursor) await this.loadOrders();
    } catch (error) {
      showError(error, '删除订单失败');
    } finally {
      this.setData({ deletingId: '' });
    }
  },
});
