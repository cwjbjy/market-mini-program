const KEY = 'market-shopping-progress-v1';
const MAX_BYTES = 64 * 1024;

function read() {
  const raw = wx.getStorageSync(KEY);
  if (!raw) return [];
  try {
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry) => entry && typeof entry.orderId === 'string'
      && Array.isArray(entry.checked) && Number.isFinite(entry.lastUsed));
  } catch {
    return [];
  }
}

function utf8Size(text) {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function loadProgress(orderId) {
  const entries = read();
  const entry = entries.find((item) => item.orderId === orderId);
  if (!entry) return [];
  entry.lastUsed = Date.now();
  try {
    const updated = JSON.stringify(entries);
    if (utf8Size(updated) <= MAX_BYTES) wx.setStorageSync(KEY, updated);
  } catch {
    // Reading progress still works if refreshing its last-used time fails.
  }
  return entry.checked;
}

function saveProgress(orderId, checked, now = Date.now()) {
  const previous = read();
  const others = previous.filter((entry) => entry.orderId !== orderId)
    .sort((left, right) => right.lastUsed - left.lastUsed);
  const current = checked.length ? [{ orderId, checked: [...new Set(checked)], lastUsed: now }] : [];
  let bytes = utf8Size(JSON.stringify(current));
  if (bytes > MAX_BYTES) throw new Error('该清单的勾选记录超过本地容量');

  const kept = [...current];
  for (const entry of others) {
    const size = utf8Size(JSON.stringify(entry)) + (kept.length ? 1 : 0);
    if (bytes + size > MAX_BYTES) break;
    bytes += size;
    kept.push(entry);
  }
  wx.setStorageSync(KEY, JSON.stringify(kept));
}

function removeProgress(orderId) {
  const entries = read();
  const remaining = entries.filter((entry) => entry.orderId !== orderId);
  if (remaining.length !== entries.length) wx.setStorageSync(KEY, JSON.stringify(remaining));
}

module.exports = { loadProgress, saveProgress, removeProgress };
