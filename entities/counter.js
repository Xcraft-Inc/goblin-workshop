'use strict';
const {buildEntity} = require('goblin-workshop');

/******************************************************************************/

const entity = {
  type: 'counter',
  cache: '2',
  properties: {
    name: {
      type: 'string',
      defaultValue: null,
    },
    count: {
      type: 'number',
      defaultValue: 20000,
    },
  },

  summaries: {
    info: {type: 'string', defaultValue: ''},
  },

  buildSummaries: function (quest, entity) {
    let info = `${entity.get('type')}: ${entity.get('count')}`;
    return {
      info,
    };
  },

  quests: {
    increment: function* (quest) {
      const state = quest.goblin.getState();
      const newValue = state.get('count') + 1;
      yield quest.me.change({path: 'count', newValue});
      return newValue;
    },
  },

  onNew: function (quest, desktopId, id, type) {
    if (!type) {
      throw new Error('invalid counter type');
    }
    const parts = id.split('@');
    if (parts[1] !== type) {
      throw new Error('invalid counter id, must contain name after @');
    }
    //a new counter will start at 20000
    return {
      id,
    };
  },
};

/******************************************************************************/

module.exports = {
  entity,
  service: buildEntity(entity),
};
