'use strict';
//T:2019-04-09

const T = require('goblin-nabu/widgets/helpers/t.js');
const {buildWorkitem, editSelectedEntityQuest} = require('goblin-workshop');

const config = {
  type: 'model',
  kind: 'search',
  title: T('Modèles'),
  list: 'model',
  hinters: {
    model: {
      onValidate: editSelectedEntityQuest('model-workitem'),
    },
  },
};

exports.xcraftCommands = function () {
  return buildWorkitem(config);
};
