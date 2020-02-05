'use strict';
const {buildEntity} = require('goblin-workshop');

const entity = {
  type: 'field',
  properties: {
    kind: {type: 'string', defaultValue: 'field'},
    labelText: {type: 'string', defaultValue: 'Custom field'},
    model: {type: 'string', defaultValue: null},
  },
  summaries: {
    info: {type: 'string', defaultValue: ''},
  },
  quests: {},
  buildSummaries: function(quest, workitem) {
    let info = 'field';
    return {
      info,
    };
  },
  indexer: function(quest, customer) {
    const info = customer.get('meta.summaries.info', '');
    return {info};
  },
  onNew: function(quest, desktopId, id, kind, labelText, model) {
    return {
      id,
      kind: kind || 'field',
      labelText: labelText || 'Custom field',
      model: model || null,
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};
