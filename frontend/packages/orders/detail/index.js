const { previewImage } = require('../../../lib/images');
const { loadOrder, openOrderPage } = require('../../../lib/order-snapshot');
const { errorMessage } = require('../../../lib/ui');

Page({
  data: { order: null, loading: true, loadError: '' },

  onLoad(options) {
    this.orderId = options.orderId;
    return this.loadDetail();
  },

  async loadDetail() {
    if (this.loadingOrder) return;
    this.loadingOrder = true;
    this.setData({ loading: true, loadError: '' });
    try {
      const order = await loadOrder('/packages/orders/detail/index', this.orderId);
      this.setData({ order });
    } catch (error) {
      this.setData({ loadError: errorMessage(error, '无法加载订单详情') });
    } finally {
      this.loadingOrder = false;
      this.setData({ loading: false });
    }
  },

  openShopping() {
    if (this.data.order) openOrderPage('/packages/orders/shopping/index', this.data.order);
  },

  showImage(event) {
    previewImage(event.currentTarget.dataset.url);
  },

  backToOrders() {
    wx.switchTab({ url: '/pages/order/order' });
  },
});
