const { showError, toast } = require('../../../lib/ui');

const dragState = { orderSaving: false, dragIndex: -1, dragTarget: -1, dragOffset: 0, dragStride: 0 };

function createCardOrder({ list, save, reload, hasFooter = false, blocked = () => false }) {
  function reset(page, update = {}) {
    clearInterval(page.dragScrollTimer);
    page.cardDrag = null;
    page.setData({ dragIndex: -1, dragTarget: -1, dragOffset: 0, ...update });
  }

  function cancel(page) {
    if (page.cardDrag) reset(page);
  }

  function preview(page) {
    const drag = page.cardDrag;
    if (!drag?.stride) return;
    const { index, stride, y, startY, startScroll } = drag;
    const distance = y - startY + (page.pageScroll || 0) - startScroll;
    const offset = Math.min((page.data[list].length - 1 - index) * stride, Math.max(-index * stride, distance));
    drag.target = Math.round(index + offset / stride);
    if (offset !== page.data.dragOffset || drag.target !== page.data.dragTarget) {
      page.setData({ dragOffset: offset, dragTarget: drag.target });
    }
  }

  function scrollDuringDrag(page) {
    const drag = page.cardDrag;
    if (!drag?.stride) return;
    const direction = drag.y < 44 ? -1 : drag.y > drag.viewportBottom - 44 ? 1 : 0;
    if (!direction) return;
    const current = page.pageScroll || 0;
    const next = Math.min(drag.maxScroll, Math.max(0, current + direction * 12));
    if (next !== current) wx.pageScrollTo({ scrollTop: next, duration: 0 });
  }

  function start(page, point) {
    if (page.data[list].length < 2 || page.cardDrag || page.fetching || page.data.orderSaving || blocked(page)) return;
    const index = Number(point.index);
    const y = Number(point.y);
    if (point.y == null || !Number.isFinite(y) || !page.data[list][index]) return;
    const drag = { index, target: index, startY: y, y, startScroll: page.pageScroll || 0 };
    page.cardDrag = drag;
    page.setData({ dragIndex: index, dragTarget: index, dragOffset: 0, dragStride: 0 });

    const query = page.createSelectorQuery();
    query.selectAll('.card-order-row').boundingClientRect();
    query.select('.card-order-page').boundingClientRect();
    if (hasFooter) query.select('.card-order-footer').boundingClientRect();
    drag.ready = new Promise((resolve) => {
      query.exec(([rows, content, footer]) => {
        resolve();
        if (page.cardDrag !== drag) return;
        const stride = rows?.length > 1 ? rows[1].top - rows[0].top : 0;
        if (stride <= 0 || !content) {
          cancel(page);
          return;
        }
        const { windowHeight } = wx.getWindowInfo();
        drag.stride = stride;
        drag.viewportBottom = footer?.top ?? windowHeight;
        drag.maxScroll = Math.max(0, content.height - windowHeight);
        page.setData({ dragStride: stride });
        preview(page);
        if (!drag.released) page.dragScrollTimer = setInterval(() => scrollDuringDrag(page), 32);
      });
    });
  }

  function move(page, { y } = {}) {
    if (!page.cardDrag || y == null || !Number.isFinite(Number(y))) return;
    page.cardDrag.y = Number(y);
    preview(page);
  }

  async function finish(page, point) {
    const drag = page.cardDrag;
    if (!drag || drag.released) return;
    drag.released = true;
    clearInterval(page.dragScrollTimer);
    move(page, point);
    await drag.ready;
    if (page.cardDrag !== drag) return;
    const { index, target } = drag;
    if (index === target) {
      reset(page);
      return;
    }
    const previous = page.data[list];
    const items = [...previous];
    const [moved] = items.splice(index, 1);
    items.splice(target, 0, moved);
    reset(page, { [list]: items, orderSaving: true });
    try {
      await save({ ids: items.map(({ id }) => id), expectedIds: previous.map(({ id }) => id) }, page);
      if (page.unloaded) return;
      page.setData({ orderSaving: false });
      toast('顺序已保存', 'success');
    } catch (error) {
      if (page.unloaded) return;
      page.setData({ [list]: previous, orderSaving: false });
      showError(error, '保存顺序失败');
      await reload(page);
    }
  }

  return {
    start, move, finish, cancel,
    lifecycle: {
      onHide() { cancel(this); },
      onResize() { cancel(this); },
      onPageScroll({ scrollTop }) {
        this.pageScroll = Math.max(0, scrollTop);
        preview(this);
      },
      onUnload() {
        clearInterval(this.dragScrollTimer);
        this.cardDrag = null;
        this.unloaded = true;
      },
    },
  };
}

module.exports = { createCardOrder, dragState };
