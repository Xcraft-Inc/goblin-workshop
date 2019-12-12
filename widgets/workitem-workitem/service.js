//T:2019-02-27

'use strict';
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'workitem',
  kind: 'workitem',
  quests: {
    addField: function(quest) {
      quest.log.info('add field called');
    },
  },
};

module.exports = buildWorkitem(config);
