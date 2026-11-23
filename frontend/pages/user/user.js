Page({
  onShow() {
    this.getTabBar?.()?.setData({ selected: 'account' });
  },

  goToOrders() {
    wx.switchTab({ url: '/pages/order/order' });
  },

  goToCategories() {
    wx.navigateTo({ url: '/packages/catalog/category/manage' });
  },
});
