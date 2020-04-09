'use strict';
const {buildEntity} = require('goblin-workshop');
const typeList = require('../lib/typeList.js');

/******************************************************************************/

const entity = {
  type: 'column',

  properties: {
    type: {
      type: 'enum',
      values: [null, ...typeList],
      defaultValue: null,
    },
    text: {type: 'string', defaultValue: ''},
    path: {type: 'string', defaultValue: ''},
    width: {type: 'string', defaultValue: ''},
    grow: {type: 'string', defaultValue: ''},
  },

  summaries: {
    info: {type: 'string', defaultValue: ''},
  },

  quests: {
    //DETECT COLUMN PATH TARGET TYPE
    setType: function* (quest, entityType) {
      const path = quest.goblin.getState().get('path');
      if (!path) {
        return;
      }
      const schemaAPI = quest.getAPI(`entity-schema@${entityType}`);
      const type = yield schemaAPI.getType({path});
      if (type) {
        yield quest.me.change({path: 'type', newValue: type});
      } else {
        yield quest.me.change({path: 'type', newValue: ''});
      }
    },
  },

  buildSummaries: function (quest, workitem) {
    let info = 'column';
    return {
      info,
    };
  },

  indexer: function (quest, customer) {
    const info = customer.get('meta.summaries.info', '');
    return {info};
  },

  onNew: function (quest, desktopId, id, text, path) {
    return {
      id,
      type: null,
      text: text || '',
      path: path || '',
      width: '',
      grow: '',
    };
  },
};

/******************************************************************************/

module.exports = {
  entity,
  service: buildEntity(entity),
};
