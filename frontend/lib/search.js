function nearMatch(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length > b.length) return nearMatch(right, left);

  let errors = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else {
      if (errors === 1) return false;
      errors += 1;
      if (a.length === b.length) i += 1;
      j += 1;
    }
  }
  return errors + (b.length - j) <= 1;
}

function filterCategories(categories, query) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return categories;

  return categories.map((category) => ({
    ...category,
    recipes: category.recipes.filter((recipe) => {
      const name = recipe.name.toLowerCase();
      return name.includes(keyword) || nearMatch(name, keyword);
    }),
  })).filter((category) => category.recipes.length > 0);
}

module.exports = { filterCategories };
