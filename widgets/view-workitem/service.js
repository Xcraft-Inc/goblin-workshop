//T:2019-02-27

'use strict';
const {buildWorkitem} = require('goblin-workshop');

const config = {
  type: 'view',
  kind: 'workitem',
  onLoad: function*(quest) {
    const desktopId = quest.goblin.getX('desktopId');
    const entityType = quest.goblin.getX('entityId').split('@')[1];
    const serviceId = `entity-schema@${entityType}`;
    yield quest.create(serviceId, {id: serviceId, desktopId, entityType});
  },
  onUpdate: function*(quest) {
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.buildQuery();
    yield entityAPI.validateColumns();
  },
};

module.exports = buildWorkitem(config);
