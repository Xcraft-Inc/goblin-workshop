'use strict';

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildWorkitem, editSelectedEntityQuest} = require('goblin-workshop');

const config = {
  name: 'cronJob-search',
  type: 'cronJob',
  kind: 'search',
  title: T('Tâches planifiées'),
  list: 'cronJob',
  detailWidget: 'cronJob-workitem',
  hinters: {
    cronJob: {
      onValidate: editSelectedEntityQuest('cronJob-workitem'),
    },
  },
};

exports.xcraftCommands = function () {
  return buildWorkitem(config);
};
