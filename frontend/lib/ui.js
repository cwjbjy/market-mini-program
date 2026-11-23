const DELETE_COLOR = '#983F35';

function errorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function toast(title, icon = 'none') {
  wx.showToast({ title, icon });
}

function showError(error, fallback) {
  toast(errorMessage(error, fallback));
}

function confirm(title, content, confirmText = '删除') {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText,
      confirmColor: DELETE_COLOR,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

module.exports = { errorMessage, toast, showError, confirm, DELETE_COLOR };
