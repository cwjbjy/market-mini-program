const api = require('../../../lib/api');
const cart = require('../../../lib/cart');
const { errorMessage, showError, toast } = require('../../../lib/ui');
const { previewImage } = require('../../../lib/images');
const { splitIngredients } = require('../../../lib/ingredients');

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
      const ingredients = splitIngredients(recipe.ingredients || '');
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

  addToCart() {
    const { loading, recipe } = this.data;
    if (loading || !recipe) return;
    try {
      if (cart.adjustQuantity(recipe.id, 1)) toast('已加入购物车', 'success');
      else toast('这道菜已达到数量上限');
    } catch (error) {
      showError(error, '无法加入购物车');
    }
  },

  editRecipe() {
    wx.navigateTo({ url: '/packages/catalog/recipe/editor?recipeId=' + encodeURIComponent(this.recipeId) });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
