'use strict';
const {buildEntity} = require('goblin-workshop');
const toPath = require('lodash/toPath');
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
      yield quest.me.buildQuery();
    },
    buildQuery: function*(quest) {
      let currentColumns = quest.goblin.getState().get('private.columns');
      //simple case
      const paths = currentColumns.map(c => {
        return toPath(c.get('path'));
      });

      const indexByRoot = {};
      const query = paths.reduce((q, p) => {
        let index = null;
        if (!indexByRoot[p[0]]) {
          indexByRoot[p[0]] = q.length;
        } else {
          index = indexByRoot[p[0]];
        }

        if (!index) {
          if (p.length === 1) {
            q.push(p[0]);
          } else {
            q.push(
              p.reduceRight((o, s, i) => {
                if (i === p.length - 1) {
                  o[s] = true;
                  return o;
                } else {
                  const nextObj = {};
                  nextObj[s] = {...o};
                  return nextObj;
                }
              }, {})
            );
          }
        }
        return q;
      }, []);
      yield quest.me.change({path: 'query', newValue: query});
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
      query: [],
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};
