'use strict';
const {buildEntity} = require('goblin-workshop');

const entity = {
  type: 'column',
  quests: {
    //DETECT COLUMN PATH TARGET TYPE
    setType: function*(quest, entityType) {
      const path = quest.goblin.getState().get('path');
      if (!path) {
        return;
      }
      try {
        const pathParts = path.split('.');
        if (pathParts.length > 1) {
          switch (pathParts[0]) {
            case 'meta':
              switch (pathParts[1]) {
                case 'status':
                  yield quest.me.change({
                    path: 'type',
                    newValue: 'enum',
                    muteChanged: true,
                  });
                  break;
                default:
                  yield quest.me.change({
                    path: 'type',
                    newValue: 'string',
                    muteChanged: true,
                  });
              }

              break;
            case 'sums':
              switch (pathParts[1]) {
                case 'base':
                case 'cost':
                case 'reward':
                  yield quest.me.change({
                    path: 'type',
                    newValue: 'price',
                    muteChanged: true,
                  });
                  break;
                default:
                  yield quest.me.change({
                    path: 'type',
                    newValue: 'number',
                    muteChanged: true,
                  });
              }
              break;
          }
        } else {
          const conf = buildEntity.configurations[entityType];
          if (conf && conf.properties) {
            yield quest.me.change({
              path: 'type',
              newValue: conf.properties[path].type || 'string',
              muteChanged: true,
            });
          } else {
            yield quest.me.change({
              path: 'type',
              newValue: 'string',
              muteChanged: true,
            });
          }
        }
      } catch {
        yield quest.me.change({
          path: 'type',
          newValue: 'invalid',
          muteChanged: true,
        });
      }
    },
  },
  buildSummaries: function(quest, workitem) {
    let info = 'column';
    return {
      info,
    };
  },
  indexer: function(quest, customer) {
    const info = customer.get('meta.summaries.info', '');
    return {info};
  },
  onNew: function(quest, desktopId, id, text, path) {
    return {
      id,
      type: null,
      text: text || '',
      path: path || '',
    };
  },
};

module.exports = {
  entity,
  service: buildEntity(entity),
};
