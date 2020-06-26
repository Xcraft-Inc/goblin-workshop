'use strict';

const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'cronJob',
  kind: 'workitem',
  quests: {
    toggleEnabled: function* (quest) {
      const entityId = quest.goblin.getX('entityId');
      const entityAPI = quest.getAPI(entityId);
      yield entityAPI.toggleEnabled();
    },
    doJob: function* (quest) {
      const desktopId = quest.getDesktop();
      const entityId = quest.goblin.getX('entityId');
      const entityAPI = quest.getAPI(entityId);
      yield entityAPI.doJob({desktopId});
    },
  },
};

module.exports = buildWorkitem(config);
