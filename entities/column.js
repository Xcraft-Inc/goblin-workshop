'use strict';
const {buildEntity} = require('goblin-workshop');

const entity = {
  type: 'column',
  quests: {},
  buildSummaries: function(quest, workitem) {
    let info = 'column';
    return {
      info,
    };
  },
  indexer: function(quest, customer) {
    const info = customer.get('meta.summaries.info', '');
    return {info};
  },
  onNew: function(quest, desktopId, id, type, text, path) {
    return {
      id,
      type: type || null,
      text: text || '',
      path: path || '',
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};
