'use strict';
//T:2019-04-09

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'property',
  kind: 'plugin',
  title: '',
};

exports.xcraftCommands = function () {
  return buildWorkitem(config);
};
