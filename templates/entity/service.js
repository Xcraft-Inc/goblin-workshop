module.exports = entity => `'use strict';

const {buildEntity} = require('goblin-workshop');
const getGoblinFullState = require('../lib/utils/getGoblinFullState');

/******************************************************************************/

const entity = {
  type: '${entity.type}',
  references: ${JSON.stringify(entity.references)},
  values: ${JSON.stringify(entity.values)},
  properties: ${JSON.stringify(entity.properties)},
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
  quests: {
    getFullState: function*(quest) {
      return yield* getGoblinFullState(quest);
    },
  },
  onNew: function(
    quest,
    id
  ) {
    return {
      id,
      ${Object.keys(entity.references)
        .map(key => `${key}`)
        .join(',') +
        ',' +
        Object.keys(entity.values)
          .map(key => `${key}`)
          .join(',') +
        ',' +
        Object.keys(entity.properties)
          .map(key => `${key}`)
          .join(',')}
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};`;
