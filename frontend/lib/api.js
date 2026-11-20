const origins = require('../config');

function origin() {
  const version = wx.getAccountInfoSync().miniProgram.envVersion || 'develop';
  const value = (origins[version] || '').trim().replace(/\/+$/, '');
  const protocol = version === 'develop' ? /^https?:\/\//i : /^https:\/\//i;
  if (!protocol.test(value)) {
    throw new Error('请配置当前版本的 API 地址');
  }
  return value;
}

function failure(message, properties) {
  return Object.assign(new Error(message), properties);
}

function unwrap(response) {
  let result = response.data;
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result);
    } catch {
      result = null;
    }
  }

  const status = response.statusCode;
  if (status >= 200 && status < 300 && result && result.code === 0) {
    return result.data;
  }
  const message = result && result.message;
  throw failure(message || (status >= 500 ? '服务暂时不可用，请重试' : '请求失败，请重试'), {
    status,
    definitive: Boolean(result && typeof result.code === 'number' && result.code !== 0
      && status >= 400 && status < 500 && ![408, 429].includes(status)),
  });
}

function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: origin() + '/api' + path,
      method,
      data,
      timeout: 12000,
      header: { 'content-type': 'application/json' },
      success: (response) => {
        try {
          resolve(unwrap(response));
        } catch (error) {
          reject(error);
        }
      },
      fail: () => reject(failure('网络连接失败，请检查网络后重试')),
    });
  });
}

function uploadImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: origin() + '/api/images',
      filePath,
      name: 'file',
      timeout: 20000,
      success: (response) => {
        try {
          const result = unwrap(response);
          if (!result || !result.path) {
            throw failure('服务器没有返回图片地址，请重试');
          }
          resolve(result.path);
        } catch (error) {
          reject(error);
        }
      },
      fail: () => reject(failure('图片上传失败，请重试')),
    });
  });
}

function mediaUrl(path) {
  if (!path || typeof path !== 'string') return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.startsWith('/') || path.startsWith('//')) return '';
  try {
    return origin() + path;
  } catch {
    return '';
  }
}

const withId = (path, id) => path + '/' + encodeURIComponent(id);

module.exports = {
  mediaUrl,
  uploadImage,
  getCategories: () => request('/categories'),
  createCategory: (data) => request('/categories', 'POST', data),
  updateCategory: (id, data) => request(withId('/categories', id), 'PUT', data),
  deleteCategory: (id) => request(withId('/categories', id), 'DELETE'),
  getRecipe: (id) => request(withId('/recipes', id)),
  createRecipe: (data) => request('/recipes', 'POST', data),
  updateRecipe: (id, data) => request(withId('/recipes', id), 'PUT', data),
  deleteRecipe: (id) => request(withId('/recipes', id), 'DELETE'),
  getOrders: () => request('/orders'),
  createOrder: (data) => request('/orders', 'POST', data),
  deleteOrder: (id) => request(withId('/orders', id), 'DELETE'),
};
