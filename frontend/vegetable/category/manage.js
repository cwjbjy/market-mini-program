const api = require('../../lib/api');
const { confirm, toast, showError, errorMessage } = require('../../lib/ui');
const { chooseImage, previewImage } = require('../../lib/images');

Page({
  data: {
    categories: [],
    loading: true,
    loadError: '',
    sheetOpen: false,
    name: '',
    imageUrl: '',
    localImage: '',
    editingId: '',
    saving: false,
    deletingId: '',
    formError: '',
  },

  onShow() {
    this.loadCategories();
  },

  async onPullDownRefresh() {
    try {
      await this.loadCategories();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  loadCategories() {
    if (!this.fetching) {
      this.fetching = this.fetchCategories().finally(() => {
        this.fetching = null;
        this.setData({ loading: false });
      });
    }
    return this.fetching;
  },

  async fetchCategories() {
    try {
      const categories = await api.getCategories();
      this.setData({
        categories: categories.map(({ id, name, image, recipes }) => ({
          id,
          name,
          image,
          imageUrl: api.mediaUrl(image),
          recipeCount: recipes.length,
        })),
        loadError: '',
      });
    } catch (error) {
      this.setData({ loadError: errorMessage(error, '无法加载分类') });
    }
  },

  startCreate() {
    this.openEditor();
  },

  startEdit(event) {
    const category = this.data.categories.find((item) => item.id === event.currentTarget.dataset.id);
    if (category) this.openEditor(category);
  },

  openEditor(category) {
    this.image = category ? category.image : '';
    this.uploadedImage = '';
    this.setData({
      sheetOpen: true,
      editingId: category ? category.id : '',
      name: category ? category.name : '',
      imageUrl: category ? category.imageUrl : '',
      localImage: '',
      formError: '',
    });
  },

  closeEditor() {
    if (!this.data.saving && !this.choosingPhoto) this.setData({ sheetOpen: false });
  },

  onVisibilityChange(event) {
    if (!event.detail.visible) this.closeEditor();
  },

  changeName(event) {
    this.setData({ name: event.detail.value, formError: '' });
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

  async saveCategory() {
    if (this.data.saving || this.choosingPhoto) return;
    const name = this.data.name.trim();
    if (!name || (!this.image && !this.data.localImage)) {
      this.setData({ formError: !name ? '请输入分类名称' : '请选择分类图片' });
      return;
    }

    this.setData({ saving: true, formError: '' });
    try {
      if (this.data.localImage && !this.uploadedImage) {
        this.uploadedImage = await api.uploadImage(this.data.localImage);
      }
      const data = { name, image: this.uploadedImage || this.image };
      if (this.data.editingId) await api.updateCategory(this.data.editingId, data);
      else await api.createCategory(data);
      this.setData({ sheetOpen: false });
      toast('分类已保存', 'success');
      await this.fetching;
      await this.loadCategories();
    } catch (error) {
      this.setData({ formError: errorMessage(error, '保存分类失败，请重试') });
    } finally {
      this.setData({ saving: false });
    }
  },

  async removeCategory(event) {
    const { id, name } = event.currentTarget.dataset;
    if (this.data.deletingId) return;
    this.setData({ deletingId: id });
    try {
      if (!await confirm('删除分类', '确定删除「' + name + '」及分类下的所有菜谱吗？')) return;
      await api.deleteCategory(id);
      await this.fetching;
      this.setData({ categories: this.data.categories.filter((category) => category.id !== id) });
      toast('分类已删除', 'success');
      await this.loadCategories();
    } catch (error) {
      showError(error, '删除分类失败');
    } finally {
      this.setData({ deletingId: '' });
    }
  },
});
