const KEY = 'market-cart-v1';

function read() {
  const value = wx.getStorageSync(KEY);
  return value && Array.isArray(value.items) ? value : { items: [], pending: null };
}

function save(items, pending) {
  wx.setStorageSync(KEY, { items, pending });
}

function sorted(items) {
  return [...items].sort((left, right) => {
    if (left.recipeId === right.recipeId) return 0;
    return left.recipeId < right.recipeId ? -1 : 1;
  });
}

function saveQuantity({ items, pending }, recipeId, quantity) {
  if (pending) throw new Error('请先确认上一次提交结果');
  const next = items.filter((item) => item.recipeId !== recipeId);
  if (Number.isInteger(quantity) && quantity > 0) next.push({ recipeId, quantity });
  save(sorted(next), null);
}

function replaceQuantity(recipeId, quantity) {
  saveQuantity(read(), recipeId, quantity);
}

function adjustQuantity(recipeId, delta) {
  const state = read();
  const previous = state.items.find((item) => item.recipeId === recipeId)?.quantity || 0;
  const quantity = Math.max(0, Math.min(9999, previous + delta));
  saveQuantity(state, recipeId, quantity);
  return quantity !== previous;
}

function prepareOrder() {
  const { items, pending } = read();
  if (pending) return pending;
  if (items.length === 0) throw new Error('请先选择菜谱');

  const randomPart = () => Math.random().toString(36).slice(2);
  const order = { requestId: [Date.now().toString(36), randomPart(), randomPart()].join('-'), items };
  save(items, order);
  return order;
}

function clearPending(requestId) {
  const { items, pending } = read();
  if (pending && pending.requestId === requestId) save(items, null);
}

function acceptOrder(requestId) {
  const { pending } = read();
  if (pending && pending.requestId === requestId) save([], null);
}

function clear() {
  const { pending } = read();
  if (pending) throw new Error('请先确认上一次提交结果');
  save([], null);
}

module.exports = { read, replaceQuantity, adjustQuantity, prepareOrder, clearPending, acceptOrder, clear };
