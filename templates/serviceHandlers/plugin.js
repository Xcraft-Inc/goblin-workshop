module.exports = type => `'use strict';

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: '${type}',
  kind: 'plugin',
  title: T("${type}"),
};

exports.xcraftCommands = function() {
  return buildWorkitem(config);
};`;
