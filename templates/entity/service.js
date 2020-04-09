module.exports = (entity) => {
  let onNewEntity = '';

  if (entity.references) {
    onNewEntity =
      ',' +
      Object.keys(entity.references)
        .map((key) => `${key}`)
        .join(',');
  }
  if (entity.values) {
    onNewEntity +=
      ',' +
      Object.keys(entity.values)
        .map((key) => `${key}`)
        .join(',');
  }

  if (entity.properties) {
    onNewEntity +=
      ',' +
      Object.keys(entity.properties)
        .map((key) => `${key}`)
        .join(',');
  }

  return `'use strict';

const {buildEntity} = require('goblin-workshop');
const getGoblinFullState = require('../lib/utils/getGoblinFullState');

/******************************************************************************/

const entity = {
  type: '${entity.type}',
  references: ${entity.references ? JSON.stringify(entity.references) : '{}'},
  values: ${entity.values ? JSON.stringify(entity.values) : '{}'},
  properties: ${entity.properties ? JSON.stringify(entity.properties) : '{}'},
  },
  indexer: function(quest, customer) {
    const info = customer.get('meta.summaries.info');
    return {info};
  },
  buildSummaries: function(quest, entity, peers, MD) {
    const getMetaInfo = x => {
      return x.get('meta.summaries.info');
    };
    const shortDescription = entity.get('shortDescription');
    const reference = entity.get('reference');

    const info = shortDescription;

    MD.flush();
    MD.addTitle(
      shortDescription + " " + reference
    );
    if (peers.options) {
      MD.addUnorderedList(peers.options.map(getMetaInfo));
    }
    const description = MD.toString();

    return {info, description};
  },
  quests: {},
  onNew: function(
    quest,
    id
  ) {
    return {
      id${onNewEntity}
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};`;
};
