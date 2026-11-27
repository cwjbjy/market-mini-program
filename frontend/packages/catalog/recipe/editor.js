const api = require('../../../lib/api');
const { errorMessage, toast } = require('../../../lib/ui');
const { chooseImage, previewImage } = require('../../../lib/images');
const { splitIngredients, ingredientName } = require('../../../lib/ingredients');
const { splitSteps } = require('../../../lib/cooking-instructions');

const INGREDIENT_LIMIT = 200;
const INSTRUCTION_LENGTH = 500;
const INSTRUCTION_LIMITS = { stepRows: 50, tipRows: 20 };
const NOTE_DESTINATIONS = ['添加为新步骤', '写到小贴士'];

function ingredientRow(row) {
  const parts = splitIngredients(row.value);
  const name = parts.length === 1 ? ingredientName(parts[0]) : '';
  const invalid = Boolean(row.value.trim()) && !name;
  const match = invalid && row.value.match(/^\s*(.+?)\s*[（(]([^()（）]+)[）)]\s*$/);
  const moveNote = match && splitIngredients(match[1]).length === 1 && ingredientName(match[1]) && match[2].trim()
    ? { value: match[1].trim(), note: match[2].trim() } : null;
  const hint = moveNote ? '括号里的说明可移到步骤或小贴士。'
    : /或/.test(row.value) ? '请填写默认要买的一种，替换方案可写进步骤。'
      : '请整理成一项食材，例如「鸡蛋 3 个」。';
  return { ...row, name, invalid, moveNote, hint };
}

Page({
  data: {
    categories: [],
    categoryIndex: -1,
    form: { categoryId: '', name: '', ingredients: '', image: '' },
    localImage: '',
    imageUrl: '',
    loading: true,
    loadError: '',
    formError: '',
    saving: false,
    ingredientRows: [],
    ingredientPreview: [],
    ingredientInvalidCount: 0,
    ingredientLength: 0,
    legacyIngredients: false,
    focusedIngredientId: 0,
    pasteOpen: false,
    pasteText: '',
    pasteKind: 'ingredients',
    stepRows: [],
    tipRows: [],
    noteDestination: null,
  },

  onLoad(options) {
    this.ingredientRowId = 0;
    this.instructionRowId = 0;
    this.recipeId = options.recipeId || '';
    this.initialCategory = options.categoryId || '';
    wx.setNavigationBarTitle({ title: this.recipeId ? '编辑菜谱' : '新建菜谱' });
  },

  onShow() {
    if (!this.initialized) this.loadForm();
    if (this.openedCategories) {
      this.openedCategories = false;
      this.refreshCategories();
    }
  },

  async loadForm() {
    this.setData({ loading: true, loadError: '' });
    try {
      const [categories, recipe] = await Promise.all([
        api.getCategories(),
        this.recipeId ? api.getRecipe(this.recipeId) : null,
      ]);
      const index = categories.findIndex((category) => category.id === (recipe ? recipe.categoryId : this.initialCategory));
      const form = recipe ? {
        categoryId: recipe.categoryId,
        name: recipe.name || '',
        ingredients: recipe.ingredients || '',
        image: recipe.image || '',
      } : { ...this.data.form, categoryId: index >= 0 ? categories[index].id : '' };
      const stepRows = recipe?.instructions?.steps || [];
      this.stepIds = new Set(stepRows.map(({ id }) => id));
      this.setData({
        categories,
        categoryIndex: index,
        form,
        stepRows: stepRows.length ? stepRows : [this.newInstructionRow()],
        tipRows: (recipe?.instructions?.tips || []).map((text) => this.newInstructionRow(text)),
        imageUrl: api.mediaUrl(form.image),
      });
      this.originalIngredients = recipe ? splitIngredients(form.ingredients) : null;
      const ingredients = this.originalIngredients?.length ? this.originalIngredients : [''];
      this.setIngredientRows(ingredients.map((value) => this.newIngredientRow(value)));
      this.initialized = true;
    } catch (error) {
      this.setData({ loadError: errorMessage(error, '无法加载菜谱编辑器') });
    } finally {
      this.setData({ loading: false });
    }
  },

  async refreshCategories() {
    try {
      const categories = await api.getCategories();
      const categoryIndex = categories.findIndex((category) => category.id === this.data.form.categoryId);
      this.setData({ categories, categoryIndex });
    } catch (error) {
      this.setData({ formError: errorMessage(error, '无法刷新分类') });
    }
  },

  updateInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: event.detail.value, formError: '' });
  },

  newIngredientRow(value = '') {
    return { id: ++this.ingredientRowId, value };
  },

  setIngredientRows(rows, patch = {}) {
    const ingredientRows = rows.map(ingredientRow);
    const values = ingredientRows.map(({ value }) => value.trim()).filter(Boolean);
    this.ingredientText = values.join('、');
    const original = this.originalIngredients;
    this.ingredientsUnchanged = Boolean(original && original.length === values.length
      && original.every((value, index) => value === values[index]));
    const names = new Map();
    for (const { name } of ingredientRows) {
      const id = name.toLowerCase();
      if (name && !names.has(id)) names.set(id, { id, name });
    }
    const ingredientInvalidCount = ingredientRows.filter(({ invalid }) => invalid).length;
    this.setData({
      ingredientRows,
      ingredientPreview: [...names.values()],
      ingredientInvalidCount,
      ingredientLength: this.ingredientsUnchanged ? this.data.form.ingredients.trim().length : this.ingredientText.length,
      legacyIngredients: this.ingredientsUnchanged && ingredientInvalidCount > 0,
      formError: '',
      ...patch,
    });
  },

  updateIngredient(event) {
    if (this.data.saving) return;
    const { id } = event.currentTarget.dataset;
    const value = event.detail.value;
    this.setIngredientRows(this.data.ingredientRows.map((row) => (row.id === id ? { ...row, value } : row)));
  },

  addIngredient() {
    if (this.data.saving) return;
    const row = this.newIngredientRow();
    this.setIngredientRows([...this.data.ingredientRows, row], { focusedIngredientId: row.id });
  },

  blurIngredient(event) {
    if (this.data.focusedIngredientId === event.currentTarget.dataset.id) this.setData({ focusedIngredientId: 0 });
  },

  removeIngredient(event) {
    if (this.data.saving) return;
    const rows = this.data.ingredientRows.filter(({ id }) => id !== event.currentTarget.dataset.id);
    this.setIngredientRows(rows.length ? rows : [this.newIngredientRow()]);
  },

  moveIngredientNote(event) {
    if (this.data.saving) return;
    const { id } = event.currentTarget.dataset;
    const target = this.data.ingredientRows.find((row) => row.id === id);
    if (!target?.moveNote) return;
    const steps = this.data.stepRows.filter(({ text }) => text.trim());
    const choices = [...NOTE_DESTINATIONS, ...steps.map(({ text }, index) => '追加到第 ' + (index + 1) + ' 步 · ' + text.trim().slice(0, 26))];
    this.setData({ noteDestination: { ingredientId: id, stepIds: steps.map(({ id: stepId }) => stepId), choices, index: 0 } });
  },

  selectNoteDestination(event) {
    const noteDestination = this.data.noteDestination;
    if (noteDestination) this.setData({ noteDestination: { ...noteDestination, index: Number(event.detail.value) } });
  },

  closeNoteDestination() {
    this.setData({ noteDestination: null });
  },

  onNoteVisibility(event) {
    if (!event.detail.visible && this.data.noteDestination) this.closeNoteDestination();
  },

  applyIngredientNote() {
    const destination = this.data.noteDestination;
    if (this.data.saving || !destination) return;
    const row = this.data.ingredientRows.find(({ id }) => id === destination.ingredientId);
    if (!row?.moveNote) return;
    const { value, note } = row.moveNote;
    const content = ingredientName(value) + '：' + note;
    const { index, stepIds } = destination;
    let patch;
    if (index < NOTE_DESTINATIONS.length) {
      const list = index === 0 ? 'stepRows' : 'tipRows';
      const rows = this.data[list].filter(({ text }) => text.trim());
      if (rows.length >= INSTRUCTION_LIMITS[list] || content.length > INSTRUCTION_LENGTH) {
        toast('此处已达上限，请先整理内容');
        return;
      }
      patch = { [list]: [...rows, this.newInstructionRow(content)] };
    } else {
      const id = stepIds[index - NOTE_DESTINATIONS.length];
      const step = this.data.stepRows.find((item) => item.id === id);
      if (!step) return;
      const text = step.text.trim() + '\n' + content;
      if (text.length > INSTRUCTION_LENGTH) {
        toast('该步骤不能超过 500 字');
        return;
      }
      patch = { stepRows: this.data.stepRows.map((item) => item.id === id ? { ...item, text } : item) };
    }
    const ingredients = this.data.ingredientRows.map((item) => item.id === row.id ? { ...item, value } : item);
    this.setIngredientRows(ingredients, { ...patch, noteDestination: null });
  },

  newInstructionRow(text = '') {
    let id;
    do {
      id = 'step-' + (++this.instructionRowId);
    } while (this.stepIds.has(id));
    this.stepIds.add(id);
    return { id, text };
  },

  openPaste(event) {
    if (!this.data.saving) this.setData({ pasteOpen: true, pasteKind: event?.currentTarget.dataset.kind || 'ingredients', pasteText: '', focusedIngredientId: 0 });
  },

  closePaste() {
    this.setData({ pasteOpen: false, pasteText: '' });
  },

  onPasteVisibility(event) {
    if (!event.detail.visible && this.data.pasteOpen) this.closePaste();
  },

  updatePasteText(event) {
    this.setData({ pasteText: event.detail.value });
  },

  importRows() {
    if (this.data.saving || !this.data.pasteOpen) return;
    if (this.data.pasteKind === 'steps') {
      const values = splitSteps(this.data.pasteText);
      if (!values.length) {
        toast('请粘贴制作步骤');
        return;
      }
      const rows = this.data.stepRows.filter(({ text }) => text.trim());
      if (rows.length + values.length > INSTRUCTION_LIMITS.stepRows || values.some((text) => text.length > INSTRUCTION_LENGTH)) {
        toast('最多 50 步，每步不超过 500 字');
        return;
      }
      this.setData({ stepRows: [...rows, ...values.map((text) => this.newInstructionRow(text))], pasteOpen: false, pasteText: '', formError: '' });
      return;
    }
    const values = splitIngredients(this.data.pasteText);
    if (!values.length) {
      toast('请粘贴食材配料');
      return;
    }
    const rows = this.data.ingredientRows.filter(({ value }) => value.trim());
    this.setIngredientRows([...rows, ...values.map((value) => this.newIngredientRow(value))], { pasteOpen: false, pasteText: '' });
  },

  updateInstruction(event) {
    if (this.data.saving) return;
    const { list, index } = event.currentTarget.dataset;
    this.setData({ [list + '[' + index + '].text']: event.detail.value, formError: '' });
  },

  addInstruction(event) {
    if (this.data.saving) return;
    const { list } = event.currentTarget.dataset;
    const rows = this.data[list];
    if (rows.length >= INSTRUCTION_LIMITS[list]) {
      toast('已达到条数上限');
      return;
    }
    this.setData({ [list]: [...rows, this.newInstructionRow()], formError: '' });
  },

  removeInstruction(event) {
    if (this.data.saving) return;
    const { list, index } = event.currentTarget.dataset;
    const rows = this.data[list].filter((_, position) => position !== index);
    this.setData({ [list]: rows, formError: '' });
  },

  moveInstruction(event) {
    if (this.data.saving) return;
    const { index, direction } = event.currentTarget.dataset;
    const target = index + direction;
    const rows = [...this.data.stepRows];
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    this.setData({ stepRows: rows, formError: '' });
  },

  selectCategory(event) {
    const categoryIndex = Number(event.detail.value);
    const category = this.data.categories[categoryIndex];
    if (category) this.setData({ categoryIndex, 'form.categoryId': category.id, formError: '' });
  },

  openCategories() {
    this.openedCategories = true;
    wx.navigateTo({ url: '/packages/catalog/category/manage' });
  },

  async selectPhoto() {
    if (this.data.saving || this.choosingPhoto) return;
    this.choosingPhoto = true;
    try {
      const localImage = await chooseImage();
      if (localImage) {
        this.uploadedImage = '';
        this.setData({ localImage, formError: '' });
      }
    } catch (error) {
      this.setData({ formError: errorMessage(error, '无法选择图片') });
    } finally {
      this.choosingPhoto = false;
    }
  },

  showPhoto() {
    previewImage(this.data.localImage || this.data.imageUrl);
  },

  async saveRecipe() {
    if (this.data.saving || this.choosingPhoto) return;
    const form = this.data.form;
    const payload = {
      categoryId: form.categoryId,
      name: form.name.trim(),
      ingredients: this.ingredientsUnchanged ? form.ingredients.trim() : this.ingredientText,
      instructions: {
        steps: this.data.stepRows.map(({ id, text }) => ({ id, text: text.trim() })).filter(({ text }) => text),
        tips: this.data.tipRows.map(({ text }) => text.trim()).filter(Boolean),
      },
      image: form.image,
    };
    let formError = '';
    if (this.data.categoryIndex < 0) formError = '请选择分类';
    else if (!payload.name) formError = '请输入菜名';
    else if (!payload.ingredients) formError = '请输入食材配料';
    else if (!this.ingredientsUnchanged && this.data.ingredientInvalidCount) formError = '请先修正标出的食材配料';
    else if (payload.ingredients.length > INGREDIENT_LIMIT) formError = '食材配料合计不能超过 200 个字符';
    else if (!this.recipeId && !payload.instructions.steps.length) formError = '请至少填写一步制作步骤';
    else if ([...payload.instructions.steps.map(({ text }) => text), ...payload.instructions.tips]
      .some((text) => text.length > INSTRUCTION_LENGTH)) formError = '每条步骤或小贴士不能超过 500 字';
    else if (!payload.image && !this.data.localImage) formError = '请选择菜谱图片';
    if (formError) {
      this.setData({ formError });
      return;
    }

    this.setData({ saving: true, formError: '' });
    try {
      if (this.data.localImage) {
        if (!this.uploadedImage) this.uploadedImage = await api.uploadImage(this.data.localImage);
        payload.image = this.uploadedImage;
      }
      if (this.recipeId) await api.updateRecipe(this.recipeId, payload);
      else await api.createRecipe(payload);

      toast('菜谱已保存', 'success');
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
    } catch (error) {
      this.setData({ formError: errorMessage(error, '保存菜谱失败，请重试') });
    } finally {
      this.setData({ saving: false });
    }
  },
});
