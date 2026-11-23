const api = require('../../lib/api');
const { confirm, toast, showError, errorMessage } = require('../../lib/ui');
const { previewImage } = require('../../lib/images');

Page({
  data: { orders: [], loading: true, loadError: '', deletingId: '' },

  onShow() {
    this.getTabBar?.()?.setData({ selected: 'order' });
    this.loadOrders();
  },

  async onPullDownRefresh() {
    try {
      await this.loadOrders();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  loadOrders() {
    if (!this.fetching) {
      this.fetching = this.fetchOrders().finally(() => {
        this.fetching = null;
        this.setData({ loading: false });
      });
    }
    return this.fetching;
  },

  async fetchOrders() {
    try {
      const orders = await api.getOrders();
      this.setData({
        orders: orders.map((order) => ({
          ...order,
          quantity: order.items.reduce((total, item) => total + (item.quantity || 0), 0),
          items: order.items.map((item, index) => ({
            ...item,
            rowKey: index,
            imageUrl: api.mediaUrl(item.image),
          })),
        })),
        loadError: '',
      });
    } catch (error) {
      this.setData({ loadError: errorMessage(error, '无法加载订单') });
    }
  },

  showImage(event) {
    previewImage(event.currentTarget.dataset.url);
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
      this.setData({ orders: this.data.orders.filter((order) => order.id !== id) });
      toast('订单已删除', 'success');
      await this.loadOrders();
    } catch (error) {
      showError(error, '删除订单失败');
    } finally {
      this.setData({ deletingId: '' });
    }
  },
});
