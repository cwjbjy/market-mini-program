const SIZE = 6;
const WEEK = 7 * 24 * 60 * 60 * 1000;

function lastEatenByRecipe(orders) {
  const latest = new Map();
  for (const order of orders) {
    const time = Date.parse(order.createdAt);
    if (order.deletedAt || !Number.isFinite(time)) continue;
    for (const { recipeId } of order.items || []) {
      if (recipeId && (!latest.has(recipeId) || latest.get(recipeId) < time)) latest.set(recipeId, time);
    }
  }
  return latest;
}

function buildPools(recipes, latest, now = Date.now()) {
  const time = (recipe) => latest.get(recipe.id) ?? -Infinity;
  const sorted = [...recipes].sort((a, b) => (time(a) === time(b) ? a.id.localeCompare(b.id) : time(a) - time(b)));
  const fresh = [];
  const recent = [];
  for (const recipe of sorted) {
    (time(recipe) < now - WEEK ? fresh : recent).push(recipe);
  }
  return { fresh, recent };
}

function sampleWheel({ fresh, recent }, random = Math.random) {
  if (fresh.length < SIZE) return [...fresh, ...recent.slice(0, SIZE - fresh.length)];
  const shuffled = [...fresh];
  for (let index = 0; index < SIZE; index += 1) {
    const choice = index + Math.floor(random() * (shuffled.length - index));
    [shuffled[index], shuffled[choice]] = [shuffled[choice], shuffled[index]];
  }
  return shuffled.slice(0, SIZE);
}

function reshuffleWheel(pools, previous, random = Math.random) {
  const { fresh, recent } = pools;
  if (fresh.length < SIZE) {
    const needed = SIZE - fresh.length;
    if (recent.length <= needed) return [...fresh, ...recent];
    const first = recent.findIndex(({ id }) => id === previous[fresh.length]?.id);
    const next = first < 0 ? 0 : (first + needed) % recent.length;
    return [...fresh, ...[...recent.slice(next), ...recent.slice(0, next)].slice(0, needed)];
  }
  const previousIds = new Set(previous.map(({ id }) => id));
  const next = sampleWheel(pools, random);
  if (fresh.length > SIZE && next.every(({ id }) => previousIds.has(id))) {
    const other = fresh.filter(({ id }) => !previousIds.has(id));
    next[SIZE - 1] = other[Math.floor(random() * other.length)];
  }
  return next;
}

function spinAngle(index) {
  return 5 * 360 - index * (360 / SIZE);
}

function winnerIndex(angle) {
  return ((Math.round(-angle / (360 / SIZE)) % SIZE) + SIZE) % SIZE;
}

module.exports = { SIZE, lastEatenByRecipe, buildPools, sampleWheel, reshuffleWheel, spinAngle, winnerIndex };
