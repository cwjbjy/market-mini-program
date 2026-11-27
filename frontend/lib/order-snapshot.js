const api = require('./api');
const { toast } = require('./ui');

let pending;

function formatOrder(order) {
  return {
    ...order,
    quantity: order.items.reduce((total, item) => total + (item.quantity || 0), 0),
    items: order.items.map((item, index) => ({ ...item, rowKey: index, imageUrl: api.mediaUrl(item.image) })),
  };
}

function openOrderPage(path, order) {
  if (pending) return;
  const transfer = { order, path };
  pending = transfer;
  wx.navigateTo({
    url: path + '?orderId=' + encodeURIComponent(order.id),
    fail: () => {
      if (pending === transfer) pending = undefined;
      toast('页面打开失败，请重试');
    },
  });
}

async function loadOrder(path, encodedId) {
  let id;
  try {
    id = decodeURIComponent(encodedId || '');
  } catch {
    return null;
  }
  if (!id) return null;
  if (pending?.order.id === id && pending.path === path) {
    const { order } = pending;
    pending = undefined;
    return order;
  }
  try {
    return formatOrder(await api.getOrder(id));
  } catch (error) {
    if (error.status === 404 && error.definitive) return null;
    throw error;
  }
}

module.exports = { formatOrder, openOrderPage, loadOrder };
