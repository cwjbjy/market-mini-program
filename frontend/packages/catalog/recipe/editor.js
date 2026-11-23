const api = require('../../../lib/api');
const { errorMessage, toast } = require('../../../lib/ui');
const { chooseImage, previewImage } = require('../../../lib/images');

Page({
  data: {
    categories: [],
    categoryIndex: -1,
    form: { categoryId: '', name: '', ingredients: '', steps: '', image: '' },
    localImage: '',
    imageUrl: '',
    loading: true,
    loadError: '',
    formError: '',
    saving: false,
  },

  onLoad(options) {
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
        steps: recipe.steps || '',
        image: recipe.image || '',
      } : { ...this.data.form, categoryId: index >= 0 ? categories[index].id : '' };
      this.setData({
        categories,
        categoryIndex: index,
        form,
        imageUrl: api.mediaUrl(form.image),
      });
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
      ingredients: form.ingredients.trim(),
      steps: form.steps.trim(),
      image: form.image,
    };
    let formError = '';
    if (this.data.categoryIndex < 0) formError = '请选择分类';
    else if (!payload.name) formError = '请输入菜名';
    else if (!payload.ingredients) formError = '请输入食材配料';
    else if (!payload.steps) formError = '请输入制作步骤';
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
