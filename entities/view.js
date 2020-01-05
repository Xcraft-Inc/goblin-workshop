'use strict';
const {buildEntity} = require('goblin-workshop');

const entity = {
  type: 'view',
  values: {
    columns: 'column[0..n]',
  },
  quests: {
    mergeDefaultColumns: function*(quest, columns) {
      if (!columns) {
        return;
      }
      let currentColumns = quest.goblin.getState().get('private.columns');
      if (!currentColumns) {
        currentColumns = [];
      }

      const currentByPath = currentColumns.reduce((byPath, c) => {
        byPath[c.get('path')] = c.toJS();
        return byPath;
      }, {});

      for (const column of columns) {
        if (!currentByPath[column.path]) {
          yield quest.me.addNewColumn({
            payload: {type: column.type, path: column.path, text: column.text},
          });
        }
      }
    },
  },
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
      columns: [],
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};
