'use strict';
const {buildEntity} = require('goblin-workshop');

/******************************************************************************/

const entity = {
  type: 'property',
  properties: {
    name: {
      type: 'string',
      defaultValue: null,
    },
    type: {
      type: 'string',
      defaultValue: null,
    },
  },

  summaries: {
    info: {type: 'string', defaultValue: ''},
  },

  buildSummaries: function (quest, entity) {
    let info = entity.get('name', '');
    return {
      info,
    };
  },

  indexer: function (quest, customer) {
    const info = customer.get('meta.summaries.info', '');
    return {info};
  },

  onNew: function (quest, desktopId, id, name, type) {
    return {
      id,
      name,
      type,
    };
  },
};

/******************************************************************************/

module.exports = {
  entity,
  service: buildEntity(entity),
};
