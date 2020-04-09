//T:2019-02-27

'use strict';
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'view',
  kind: 'workitem',
  onUpdate: function* (quest) {
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.buildQuery();
    yield entityAPI.validateColumns();
  },
};

module.exports = buildWorkitem(config);
