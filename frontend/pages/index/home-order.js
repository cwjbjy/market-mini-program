const api = require('../../lib/api');
const { showError, toast } = require('../../lib/ui');

const panes = {
  category: { selector: '.category-sidebar', scrollField: 'homeCategoryScrollTop' },
  recipe: { selector: '.catalog-scroll', scrollField: 'homeRecipeScrollTop' },
};
const previewData = { homeDragKind: '', homeDragId: '', homeDragOffset: 0, homeDropId: '', homeDropAfter: false };
const dragData = { ...previewData, homeOrderSaving: false, homeCategoryScrollTop: 0, homeRecipeScrollTop: 0 };
const EDGE = 44;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function validPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function cancel(page) {
  const drag = page.homeDrag;
  if (!drag) return;
  clearInterval(drag.timer);
  page.homeDrag = null;
  if (!page.unloaded) page.setData(previewData);
}

function insidePane(drag) {
  const { viewport } = drag.geometry;
  const { x, y } = drag.point;
  return x >= viewport.left && x <= viewport.right && y >= viewport.top && y <= viewport.bottom;
}

function canDrop(drag) {
  if (!insidePane(drag)) return false;
  const { viewport, section } = drag.geometry;
  const y = drag.point.y - viewport.top + drag.scrollTop;
  return !section || (y >= section.top && y < section.bottom);
}

function preview(page, drag) {
  const { rows, viewport } = drag.geometry;
  const row = rows[drag.index];
  const distance = drag.point.y - drag.start.y + drag.scrollTop - drag.geometry.startScroll;
  const targetY = drag.point.y - viewport.top + drag.scrollTop;
  let target = drag.index;
  while (target > 0 && targetY < rows[target - 1].center) target -= 1;
  while (target + 1 < rows.length && targetY > rows[target + 1].center) target += 1;
  drag.target = target;

  const offset = clamp(distance, rows[0].top - row.top, rows[rows.length - 1].bottom - row.bottom);
  const dropId = target !== drag.index && canDrop(drag) ? drag.items[target].id : '';
  const after = target > drag.index;
  if (offset !== page.data.homeDragOffset || dropId !== page.data.homeDropId || after !== page.data.homeDropAfter) {
    page.setData({ homeDragOffset: offset, homeDropId: dropId, homeDropAfter: after });
  }
}

function tick(page, drag) {
  if (page.homeDrag !== drag || drag.released || !drag.moved) return;
  const { viewport, minScroll, maxScroll } = drag.geometry;
  if (insidePane(drag)) {
    const edge = Math.min(EDGE, viewport.height / 3);
    const y = drag.point.y;
    const step = y < viewport.top + edge ? -12 : y > viewport.bottom - edge ? 12 : 0;
    if (step) {
      const next = clamp(drag.scrollTop + step, minScroll, maxScroll);
      if (next !== drag.scrollTop && page.data[drag.scrollField] !== next) page.setData({ [drag.scrollField]: next });
    }
  }
  preview(page, drag);
}

function measure(page, drag, pane, rowSelector, sectionSelector) {
  const query = page.createSelectorQuery();
  query.select(pane.selector).boundingClientRect();
  query.select(pane.selector).scrollOffset();
  query.selectAll(rowSelector).boundingClientRect();
  if (sectionSelector) query.select(sectionSelector).boundingClientRect();

  return new Promise((resolve) => {
    query.exec(([viewport, position, rows, section]) => {
      resolve();
      if (page.homeDrag !== drag) return;
      if (!viewport?.height || !Number.isFinite(position?.scrollTop) || !rows || rows.length !== drag.items.length
        || rows.some(({ dataset, top, bottom }, index) => dataset?.sortId !== drag.items[index].id || !(bottom > top))
        || (sectionSelector && !section)) {
        cancel(page);
        return;
      }

      const startScroll = Math.max(0, position.scrollTop);
      const toContent = (y) => y - viewport.top + startScroll;
      const lastBottom = toContent(rows[rows.length - 1].bottom);
      const scrollHeight = Number.isFinite(position.scrollHeight) ? position.scrollHeight : lastBottom;
      const scrollLimit = Math.max(startScroll, scrollHeight - viewport.height);
      drag.scrollTop = startScroll;
      drag.geometry = {
        viewport, startScroll,
        rows: rows.map(({ top, bottom }) => ({ top: toContent(top), bottom: toContent(bottom), center: toContent((top + bottom) / 2) })),
        section: section ? { top: toContent(section.top), bottom: toContent(section.bottom) } : null,
        minScroll: section ? clamp(toContent(section.top), 0, startScroll) : 0,
        maxScroll: section ? clamp(lastBottom - viewport.height, startScroll, scrollLimit) : scrollLimit,
      };
      if (!drag.released) {
        page.setData({ [drag.scrollField]: startScroll });
        drag.timer = setInterval(() => tick(page, drag), 32);
      }
    });
  });
}

function start(page, { kind, id, categoryId, point }) {
  const pane = panes[kind];
  if (!pane || !validPoint(point) || page.homeDrag || page.refreshTask || page.deletingRecipe || page.unloaded
    || page.data.loading || page.data.refreshing || page.data.homeOrderSaving || page.data.cartOpen || page.data.submitting
    || page.data.query.trim() || page.searchKeyword.trim()) return;

  const categoryIndex = kind === 'recipe' ? page.categories.findIndex((category) => category.id === categoryId) : -1;
  const items = kind === 'category' ? page.categories : page.categories[categoryIndex]?.recipes;
  const index = items?.findIndex((item) => item.id === id);
  if (!(items?.length > 1) || !(index >= 0)) return;

  const drag = { kind, categoryId, categoryIndex, index, items, start: point, point, scrollField: pane.scrollField };
  page.homeDrag = drag;
  page.catalogJump = null;
  page.setData({ homeDragKind: kind, homeDragId: id, categoryAnchor: '' });
  const section = kind === 'recipe' ? '#section-' + categoryIndex : null;
  const selector = section ? section + ' .home-recipe-sort-row' : '.home-category-sort-row';
  if (section) page.selectComponent?.(`#home-swipe-${categoryIndex}-${index}`)?.close?.();
  drag.ready = measure(page, drag, pane, selector, section);
}

function move(page, point) {
  const drag = page.homeDrag;
  if (drag && !drag.released && validPoint(point)) {
    drag.point = point;
    drag.moved = true;
  }
}

function onScroll(page, kind, scrollTop) {
  const drag = page.homeDrag;
  if (drag?.geometry && drag.kind === kind && Number.isFinite(scrollTop)) drag.scrollTop = Math.max(0, scrollTop);
}

async function finish(page, point) {
  const drag = page.homeDrag;
  if (!drag || drag.released) return;
  move(page, point);
  drag.released = true;
  clearInterval(drag.timer);
  await drag.ready;
  if (page.homeDrag !== drag) return;
  if (!drag.geometry || !canDrop(drag)) {
    cancel(page);
    return;
  }

  preview(page, drag);
  if (drag.index === drag.target) {
    cancel(page);
    return;
  }

  const previous = page.categories;
  const reordered = [...drag.items];
  const [item] = reordered.splice(drag.index, 1);
  reordered.splice(drag.target, 0, item);
  const categoryOrder = drag.kind === 'category';
  const order = { ids: reordered.map(({ id }) => id), expectedIds: drag.items.map(({ id }) => id) };
  page.setData({ homeOrderSaving: true });
  cancel(page);
  page.categories = categoryOrder ? reordered : previous.map((category) => (
    category.id === drag.categoryId ? { ...category, recipes: reordered } : category
  ));

  try {
    page.renderCatalog(false, true, { alignCategory: categoryOrder, selectedCategoryId: categoryOrder ? item.id : undefined });
    if (categoryOrder) await api.reorderCategories(order);
    else await api.reorderRecipes(drag.categoryId, order);
    if (!page.unloaded && !page.homeHidden) toast('顺序已保存', 'success');
  } catch (error) {
    if (page.unloaded) return;
    page.categories = previous;
    page.renderCatalog(false, true, { alignCategory: categoryOrder });
    if (!page.homeHidden) showError(error, '保存顺序失败');
    await page.fetchCatalog(categoryOrder);
  } finally {
    if (!page.unloaded) {
      page.setData({ homeOrderSaving: false });
      if (page.refreshAfterHomeOrder) {
        page.refreshAfterHomeOrder = false;
        if (!page.homeHidden) page.refreshCatalog();
      }
    }
  }
}

module.exports = { dragData, start, move, finish, cancel, onScroll };
