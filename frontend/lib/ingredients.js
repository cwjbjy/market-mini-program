const number = '(?:[0-9]+(?:[./][0-9]+)?|[零一二两三四五六七八九十百半]+)';
const unit = '(?:千克|毫克|毫升|公斤|公克|汤匙|茶匙|大勺|小勺|kg|mg|ml|克|斤|两|升|个|颗|只|根|把|片|块|瓣|条|棵|头|朵|张|勺|匙|袋|包|盒|瓶|罐|杯|份|g|l)';
const range = number + '(?:\\s*[-~～—至到]\\s*' + number + ')?';
const amount = '(?:各?\\s*(?:适量|少许|少量|若干|一些|一点(?:点)?|' + range + '\\s*' + unit + ')(?:左右|上下|即可)?)';
const trailingAmount = new RegExp('\\s*(?:\\(\\s*' + amount + '\\s*\\)|:\\s*' + amount + '|' + amount + ')$', 'i');
const leadingAmount = new RegExp('^' + range + '\\s*' + unit + '\\s*', 'i');
const amountOnly = new RegExp('^' + amount + '$', 'i');

function splitIngredients(text = '') {
  const parts = [];
  let depth = 0;
  let part = '';
  for (const character of text) {
    if (character === '(' || character === '（') depth += 1;
    else if (character === ')' || character === '）') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,，、;；。\r\n]/.test(character)) {
      parts.push(part.trim());
      part = '';
    } else {
      part += character;
    }
  }
  parts.push(part.trim());
  return parts.filter(Boolean);
}

function ingredientName(text) {
  const name = text.normalize('NFKC').trim().replace(trailingAmount, '').replace(leadingAmount, '').trim().replace(/\s+/g, ' ');
  if (!name || amountOnly.test(name) || !/[a-z\u3400-\u9fff]/i.test(name)
    || /[0-9:：()／/＋+=]|以及|或|根据|适量|少许|少量/.test(name)) return '';
  return name;
}

function buildIngredients(items) {
  const names = new Map();
  let hasUnclear = false;
  for (const item of items) {
    for (const text of splitIngredients(item.ingredients || '')) {
      const name = ingredientName(text);
      if (!name) {
        hasUnclear = true;
        continue;
      }
      const id = name.toLowerCase();
      if (!names.has(id)) names.set(id, { id, name });
    }
  }
  return { ingredients: [...names.values()], hasUnclear };
}

module.exports = { splitIngredients, ingredientName, buildIngredients };
