'use strict';

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'cronJob',
  kind: 'plugin',
  title: T('Tâches planifiées'),
};

exports.xcraftCommands = function () {
  return buildWorkitem(config);
};
