const request = require('@pf-scaffold/request');

module.exports = function () {
  return request({
    url: '/project/template',
  });
};
