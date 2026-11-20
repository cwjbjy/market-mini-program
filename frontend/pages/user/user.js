Page({
  goToOrders() {
    wx.switchTab({ url: '/pages/order/order' });
  },

  goToCategories() {
    wx.navigateTo({ url: '/vegetable/category/manage' });
  },
});
