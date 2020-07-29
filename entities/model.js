'use strict';
const {buildEntity} = require('goblin-workshop');

/******************************************************************************/

const entity = {
  type: 'model',
  values: {
    properties: 'property[0..n]',
  },
  properties: {
    type: {
      type: 'string',
      defaultValue: null,
    },
  },

  summaries: {
    info: {type: 'string', defaultValue: ''},
  },

  buildSummaries: function (quest, entity) {
    let info = entity.get('type', 'new entity');
    return {
      info,
    };
  },

  indexer: function (quest, customer) {
    const info = customer.get('meta.summaries.info', '');
    return {info};
  },

  onNew: function (quest, desktopId, id, type) {
    return {
      id,
      type,
      properties: [],
    };
  },
};

/******************************************************************************/

module.exports = {
  entity,
  service: buildEntity(entity),
};
