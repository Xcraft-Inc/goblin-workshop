'use strict';
const {buildEntity} = require('goblin-workshop');

const entity = {
  type: 'prefilter',
  properties: {
    name: {type: 'string', defaultValue: ''},
    table: {type: 'string', defaultValue: ''},
    filters: {
      type: 'object',
      defaultValue: {},
    },
    sort: {
      type: 'object',
      defaultValue: {},
    },
  },
  summaries: {
    info: {type: 'string', defaultValue: ''},
  },
  quests: {},
  buildSummaries: function (quest, workitem) {
    let info = 'prefilter';
    return {
      info,
    };
  },
  indexer: function (quest, customer) {
    const info = customer.get('meta.summaries.info', '');
    return {info};
  },
  onNew: function (quest, desktopId, id, name, table, filters, sort) {
    return {
      id,
      name: name || '',
      table,
      filters,
      sort,
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};
