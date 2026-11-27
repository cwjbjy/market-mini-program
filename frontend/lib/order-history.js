let loadedOrders = null;
let version = 0;

module.exports = {
  getLoadedOrders: () => loadedOrders,
  setLoadedOrders: (orders) => { loadedOrders = orders; },
  getVersion: () => version,
  invalidate: () => { version += 1; },
};
