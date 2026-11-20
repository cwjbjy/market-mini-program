const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const contents = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const json = (name) => JSON.parse(contents(name));
const app = json('app.json');
const pages = new Set(app.pages);
for (const { root: packageRoot, pages: packagePages } of app.subPackages) {
  for (const page of packagePages) pages.add(packageRoot + '/' + page);
}

const designRoot = path.join(root, 'node_modules', 'tdesign-miniprogram');
const installed = fs.existsSync(designRoot);
const components = new Set(Object.keys(app.usingComponents));
function checkComponents(dependencies = {}) {
  for (const componentPath of Object.values(dependencies)) {
    assert.ok(componentPath.startsWith('tdesign-miniprogram/'), componentPath);
    if (installed) {
      const file = path.join(designRoot, 'miniprogram_dist', componentPath.split('/').slice(1).join('/') + '.json');
      assert.ok(fs.existsSync(file), file);
    }
  }
}

new vm.Script(contents('app.js'), { filename: 'app.js' });
checkComponents(app.usingComponents);
for (const tab of app.tabBar.list) {
  assert.ok(app.pages.includes(tab.pagePath), tab.pagePath);
  for (const asset of [tab.iconPath, tab.selectedIconPath]) assert.ok(fs.existsSync(path.join(root, asset)), asset);
}

for (const page of pages) {
  const script = contents(page + '.js');
  new vm.Script(script, { filename: page + '.js' });
  const declaration = json(page + '.json');
  checkComponents(declaration.usingComponents);
  const registered = new Set([...components, ...Object.keys(declaration.usingComponents || {})]);
  const markup = contents(page + '.wxml');
  contents(page + '.wxss');
  for (const [, component] of markup.matchAll(/<(t-[a-z-]+)\b/g)) assert.ok(registered.has(component), page + ' ' + component);
  for (const [, asset] of markup.matchAll(/src="\/(static\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, asset)), asset);
  for (const [, handler] of markup.matchAll(/\b(?:bind|catch):?[a-z-]+="([A-Za-z]+)"/g)) {
    assert.ok(new RegExp('\\b' + handler + '\\(').test(script), page + ' ' + handler);
  }
  for (const [, route] of script.matchAll(/url: '\/([^?']+)/g)) assert.ok(pages.has(route), route);
}

console.log('Checked ' + pages.size + ' WeChat pages' + (installed ? ' and installed TDesign component paths.' : '.'));
