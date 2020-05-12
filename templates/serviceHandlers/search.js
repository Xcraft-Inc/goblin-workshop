module.exports = (type) => `'use strict';

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildWorkitem, editSelectedEntityQuest} = require('goblin-workshop');

const config = {
  type: '${type}',
  kind: 'search',
  title: T("${type}"),
  hintText: 'par ${type}',
  list: "${type}",
  hinters: {
    ${type}: {
      onValidate: editSelectedEntityQuest('${type}-workitem'),
    },
  },
};

exports.xcraftCommands = function() {
  return buildWorkitem(config);
};`;
