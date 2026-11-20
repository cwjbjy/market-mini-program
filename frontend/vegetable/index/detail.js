const api = require('../../lib/api');
const { errorMessage } = require('../../lib/ui');
const { previewImage } = require('../../lib/images');

Page({
  data: { recipe: null, ingredients: [], loading: true, loadError: '' },

  onLoad(options) {
    this.recipeId = options.recipeId;
  },

  onShow() {
    this.loadRecipe();
  },

  async loadRecipe() {
    if (!this.recipeId) {
      this.setData({ loading: false, loadError: '没有找到这道菜谱' });
      return;
    }

    this.setData({ loading: true, loadError: '' });
    try {
      const recipe = await api.getRecipe(this.recipeId);
      const ingredients = (recipe.ingredients || '').split(/[,，、。\s]+/).filter(Boolean);
      this.setData({
        recipe: { ...recipe, imageUrl: api.mediaUrl(recipe.image) },
        ingredients: ingredients.map((label, index) => ({ label, id: index })),
      });
    } catch (error) {
      this.setData({
        recipe: error.status === 404 ? null : this.data.recipe,
        loadError: errorMessage(error, '无法加载菜谱'),
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  showImage() {
    previewImage(this.data.recipe.imageUrl);
  },

  editRecipe() {
    wx.navigateTo({ url: '/vegetable/index/create?recipeId=' + encodeURIComponent(this.recipeId) });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
