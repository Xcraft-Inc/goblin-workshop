//T:2019-02-27

'use strict';
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'view',
  kind: 'workitem',
  onLoad: function* (quest) {
    //Load entity schema related to this view
    const viewId = quest.goblin.getX('entityId');
    const schemaId = `entity-schema@${viewId.split('@')[1]}`;
    yield quest.create(schemaId, {id: schemaId, desktopId: quest.getDesktop()});
  },
  onUpdate: function* (quest) {
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.buildQuery();
    yield entityAPI.validateColumns();
  },
};

module.exports = buildWorkitem(config);
