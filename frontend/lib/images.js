const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function chooseImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (response) => {
        const file = response.tempFiles[0];
        if (!file) {
          resolve('');
          return;
        }
        if (file.size > MAX_IMAGE_SIZE) {
          reject(new Error('请选择不超过 10 MB 的 JPG 或 PNG 图片'));
          return;
        }
        resolve(file.tempFilePath);
      },
      fail: (error) => {
        if (String(error.errMsg).includes('cancel')) {
          resolve('');
          return;
        }
        reject(new Error('无法选择图片，请检查微信权限后重试'));
      },
    });
  });
}

function previewImage(url) {
  if (url) wx.previewImage({ current: url, urls: [url] });
}

module.exports = { chooseImage, previewImage };
