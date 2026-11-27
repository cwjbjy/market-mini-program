const { loadOrder } = require('../../../lib/order-snapshot');
const { loadProgress, saveProgress } = require('../../../lib/shopping-progress');
const { errorMessage, toast } = require('../../../lib/ui');
const { buildIngredients } = require('../../../lib/ingredients');

Page({
  data: {
    order: null,
    loading: true,
    loadError: '',
    hasUnclear: false,
    filters: [{ id: 'all', name: '全部' }, { id: 'todo', name: '待买' }, { id: 'done', name: '已买' }],
    filter: 'all',
    visibleIngredients: [],
    total: 0,
    bought: 0,
    progress: 0,
  },

  onLoad(options) {
    this.orderId = options.orderId;
    return this.loadChecklist();
  },

  async loadChecklist() {
    if (this.loadingOrder) return;
    this.loadingOrder = true;
    this.setData({ loading: true, loadError: '' });
    try {
      const order = await loadOrder('/packages/orders/shopping/index', this.orderId);
      if (order) {
        const { ingredients, hasUnclear } = buildIngredients(order.items);
        this.ingredients = ingredients;
        try {
          this.checked = new Set(loadProgress(order.id));
        } catch {
          this.checked = new Set();
          toast('无法读取本地采购进度');
        }
        this.renderChecklist({ order, hasUnclear });
      }
    } catch (error) {
      this.setData({ loadError: errorMessage(error, '无法加载买菜清单') });
    } finally {
      this.loadingOrder = false;
      this.setData({ loading: false });
    }
  },

  renderChecklist(patch = {}) {
    const filter = patch.filter || this.data.filter;
    const items = this.ingredients.map((item) => ({ ...item, checked: this.checked.has(item.id) }));
    const bought = items.filter((item) => item.checked).length;
    this.setData({
      ...patch,
      total: items.length,
      bought,
      progress: items.length ? 100 * bought / items.length : 0,
      visibleIngredients: items.filter((item) => filter === 'all' || item.checked === (filter === 'done')),
    });
  },

  selectFilter(event) {
    const { filter } = event.currentTarget.dataset;
    if (filter !== this.data.filter) this.renderChecklist({ filter });
  },

  toggleIngredient(event) {
    const { id } = event.currentTarget.dataset;
    if (!this.data.order || !this.ingredients.some((item) => item.id === id)) return;
    const checked = new Set(this.checked);
    if (checked.has(id)) checked.delete(id);
    else checked.add(id);
    try {
      saveProgress(this.data.order.id, [...checked]);
      this.checked = checked;
      this.renderChecklist();
    } catch {
      toast('采购进度保存失败，请重试');
    }
  },

  copyRemaining() {
    const names = this.ingredients?.filter((item) => !this.checked.has(item.id)).map((item) => item.name);
    if (!names?.length) return;
    wx.setClipboardData({
      data: names.join('\n'),
      fail: () => toast('复制失败，请重试'),
    });
  },

  backToOrders() {
    wx.switchTab({ url: '/pages/order/order' });
  },
});
