const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.join(__dirname, '..');
const project = JSON.parse(fs.readFileSync(path.join(projectRoot, 'project.config.json'), 'utf8'));
const root = path.resolve(projectRoot, project.miniprogramRoot || '.');
const contents = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const json = (name) => JSON.parse(contents(name));
const isFile = (name) => fs.statSync(path.join(root, name), { throwIfNoEntry: false })?.isFile();
const app = json('app.json');
const packagedFiles = project.packOptions?.include ?? [];
const checkBuild = process.argv.includes('--built');
const subPackages = app.subPackages ?? [];
const packageRoots = [];
const packageNames = new Set();
const pages = new Set();
function registerPage(page) {
  assert.ok(!pages.has(page), 'Duplicate page: ' + page);
  pages.add(page);
}

app.pages.forEach(registerPage);
for (const { root: packageRoot, name, pages: packagePages } of subPackages) {
  assert.match(packageRoot, /^[\w-]+(?:\/[\w-]+)*$/, 'Invalid subpackage root');
  assert.ok(!packageRoots.some((other) => other === packageRoot || other.startsWith(packageRoot + '/') || packageRoot.startsWith(other + '/')),
    'Overlapping subpackage root: ' + packageRoot);
  packageRoots.push(packageRoot);
  for (const entry of new Set([packageRoot, name].filter(Boolean))) {
    assert.ok(!packageNames.has(entry), 'Duplicate subpackage name: ' + entry);
    packageNames.add(entry);
  }
  for (const page of packagePages) registerPage(packageRoot + '/' + page);
}

const owningPackage = (file) => packageRoots.find((packageRoot) => file.startsWith(packageRoot + '/'));
for (const page of app.pages) assert.ok(!owningPackage(page), 'Main page inside subpackage: ' + page);
for (const [entry, rule] of Object.entries(app.preloadRule ?? {})) {
  assert.ok(pages.has(entry), 'Unknown preload entry page: ' + entry);
  for (const name of rule.packages) assert.ok(packageNames.has(name) || name === '__APP__', 'Unknown preload package: ' + name);
}

const designRoot = path.join(projectRoot, 'node_modules', 'tdesign-miniprogram');
const buildRoot = 'miniprogram_npm/tdesign-miniprogram';
const installed = fs.existsSync(designRoot);
const components = new Set(Object.keys(app.usingComponents));
const checkedComponents = new Set();
function checkBuiltComponent(component) {
  if (checkedComponents.has(component)) return;
  checkedComponents.add(component);
  assert.ok(component.startsWith(buildRoot + '/'), 'Unexpected TDesign component path: ' + component);
  for (const extension of ['.js', '.json', '.wxml', '.wxss']) {
    const file = component + extension;
    assert.ok(isFile(file), 'Missing npm build file: ' + file + '. Run 工具 → 构建 npm in WeChat DevTools.');
  }
  for (const reference of Object.values(json(component + '.json').usingComponents ?? {})) {
    assert.ok(reference.startsWith('.'), 'Unexpected TDesign component reference: ' + reference);
    checkBuiltComponent(path.posix.join(path.posix.dirname(component), reference));
  }
}

function checkComponents(dependencies = {}) {
  for (const componentPath of Object.values(dependencies)) {
    assert.ok(componentPath.startsWith('tdesign-miniprogram/'), componentPath);
    const relative = componentPath.slice('tdesign-miniprogram/'.length);
    if (installed) {
      const file = path.join(designRoot, 'miniprogram_dist', relative + '.json');
      assert.ok(fs.existsSync(file), file);
    }
    if (checkBuild) checkBuiltComponent(buildRoot + '/' + relative);
  }
}

const scripts = new Map();
function checkScript(file) {
  if (scripts.has(file)) return scripts.get(file);
  const script = contents(file);
  scripts.set(file, script);
  new vm.Script(script, { filename: file });
  for (const [, request] of script.matchAll(/\brequire\(['"](\.[^'"]+)['"]\)/g)) {
    const relative = path.posix.join(path.posix.dirname(file), request);
    assert.ok(relative !== '..' && !relative.startsWith('../'), file + ' imports outside the mini program: ' + request);
    const target = [relative, relative + '.js', relative + '/index.js'].find(isFile);
    assert.ok(target, file + ' imports a missing module: ' + request);
    const owner = owningPackage(target);
    assert.ok(!owner || owner === owningPackage(file), file + ' cannot require a different subpackage: ' + target);
    checkScript(target);
  }
  for (const [, route] of script.matchAll(/(?:\burl:\s*|\blegacyPage\()\s*['"]\/([^?'" ]+)/g)) {
    assert.ok(pages.has(route), file + ' references an unregistered page: ' + route);
  }
  return script;
}

checkScript('app.js');
if (app.sitemapLocation) json(app.sitemapLocation);
checkComponents(app.usingComponents);
const tabPages = app.tabBar.list.map(({ pagePath }) => pagePath);
for (const page of tabPages) assert.ok(app.pages.includes(page), page);
if (app.tabBar.custom) {
  const component = 'custom-tab-bar/index';
  checkScript(component + '.js');
  assert.equal(json(component + '.json').component, true);
  contents(component + '.wxss');
  const markup = contents(component + '.wxml');
  const destinations = [...markup.matchAll(/<navigator url="\/([^"]+)" open-type="switchTab"/g)];
  assert.deepEqual(destinations.map(([, page]) => page), tabPages);
  const icons = [...markup.matchAll(/src="\/(static\/tab\/[^"]+\.png)"/g)];
  assert.equal(icons.length, tabPages.length * 2);
  for (const [, asset] of icons) {
    assert.ok(fs.existsSync(path.join(root, asset)), asset);
    assert.ok(packagedFiles.some(({ type, value }) =>
      (type === 'file' && value === asset) || (type === 'folder' && asset.startsWith(value + '/'))
    ), 'Include the tab icon in project.config.json: ' + asset);
  }
}

for (const page of pages) {
  const script = checkScript(page + '.js');
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
}

const buildSummary = checkBuild ? ', including ' + checkedComponents.size + ' built TDesign components' : '';
console.log('Checked ' + pages.size + ' WeChat routes and ' + packageRoots.length + ' subpackages' + buildSummary + '.');
