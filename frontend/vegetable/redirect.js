function legacyPage(destination, keys = []) {
  return {
    onLoad(options = {}) {
      const query = keys.filter((key) => options[key]).map((key) => key + '=' + encodeURIComponent(options[key])).join('&');
      wx.redirectTo({
        url: query ? destination + '?' + query : destination,
        fail: () => wx.switchTab({ url: '/pages/index/index' }),
      });
    },
  };
}

module.exports = legacyPage;
