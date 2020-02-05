'use strict';
const {buildEntity} = require('goblin-workshop');

const entity = {
  type: 'workitem',
  values: {
    fields: 'field[0..n]',
  },
  properties: {
    name: {type: 'string', defaultValue: null},
    fields: {type: 'array', defaultValue: []},
  },
  summaries: {
    info: {type: 'string', defaultValue: ''},
  },
  quests: {},
  buildSummaries: function(quest, workitem) {
    let info = workitem.get('name');
    return {
      info,
    };
  },
  indexer: function(quest, customer) {
    const info = customer.get('meta.summaries.info', '');
    return {info};
  },
  onNew: function(quest, desktopId, id, name) {
    return {
      id,
      name,
      fields: [],
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};
