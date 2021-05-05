'use strict';

const goblinName = 'aggregate-updater-worker';
const Goblin = require('xcraft-core-goblin');
const common = require('./workitems/common.js');
// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('id', action.get('id'));
  },
};

Goblin.registerQuest(goblinName, 'create', function (quest, desktopId) {
  quest.goblin.setX('desktopId', desktopId);
  quest.do();
});

Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

Goblin.registerQuest(goblinName, 'update-aggregate', function* (
  quest,
  desktopId,
  requestedBy,
  parentId,
  entityId
) {
  quest.log.verb(`Aggregate updater: updating ${parentId} ...`);
  try {
    const parentAPI = yield quest.create(parentId, {
      id: parentId,
      desktopId: quest.getSystemDesktop(),
    });
    yield parentAPI.updateAggregate({entityId, desktopId});
    quest.log.verb(`Aggregate updater: updating ${parentId}  [DONE]`);
  } catch (ex) {
    const err = `Aggregate updater: error during update , ${
      ex.stack || ex.message || ex
    }`;

    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'applyChanges', function* (
  quest,
  desktopId,
  changes
) {
  const SmartId = require('./smartId.js');
  for (const change of changes) {
    const entityId = change.edit;
    if (!entityId) {
      throw new Error('Failed to apply changes, entityId not provided');
    }
    const identifier = new SmartId(entityId, '*');
    if (identifier.isMalformed()) {
      throw new Error('Failed to apply changes, malformed entityId provided');
    }
    const exist = yield identifier.exist(quest);
    if (!exist) {
      throw new Error('Failed to apply changes, entity not found in storage');
    }

    const type = identifier.type;

    const entityAPI = yield quest.create(entityId, {
      id: entityId,
      desktopId: quest.getSystemDesktop(),
    });

    //LOAD AGGREGATION
    // entity-
    //       |- refs/vals
    yield entityAPI.loadGraph({
      desktopId: quest.getSystemDesktop(),
      loadedBy: quest.goblin.id,
      level: 1,
      stopAtLevel: 1,
      skipped: [],
    });

    //collection
    const level = change.path ? change.path.split('.').length : 0;

    if (level > 1) {
      throw new Error(
        `Failed to apply a change, ${change.path} dot syntax is not supported`
      );
    }

    switch (change.action) {
      case 'patch': {
        if (level === 1) {
          throw new Error(
            `Failed to apply a change, cannot patch in collection (${change.path})`
          );
        }
        yield entityAPI.apply({patch: change.payload});
        break;
      }
      case 'add': {
        if (level === 0) {
          throw new Error(
            `Failed to apply a change, missing collection propertie in path`
          );
        }
        const prop = change.path;
        const propKind = common.getPropKind(type, prop);
        const propType = common.getPropType(type, prop);
        switch (propKind) {
          case 'properties': {
            throw new Error(
              `Failed to apply a change, cannot "add" into a properties`
            );
          }
          case 'value': {
            const call = common.jsifyQuestName(`add-new-to-${prop}`);
            const payload = change.payload || {};
            if (payload.id) {
              const identifier = new SmartId(payload.id, propType);
              if (identifier.isMalformed()) {
                throw new Error(
                  `Failed to apply a change, malformed identifier ${payload.id}`
                );
              }
              const exist = yield identifier.exist(quest);
              if (exist) {
                throw new Error(
                  `Failed to apply a change, identifier already exist ${payload.id}`
                );
              }
            }
            yield entityAPI[call]({payload});
            break;
          }
          case 'reference': {
            if (level === 0) {
              throw new Error(
                `Failed to apply a change, missing collection propertie in path`
              );
            }
            const call = common.jsifyQuestName(`add-to-${prop}`);
            const entityId = change.entityId;
            if (!entityId) {
              throw new Error(`Failed to apply a change, missing entityId`);
            }
            const identifier = new SmartId(entityId, propType);
            if (identifier.isMalformed()) {
              throw new Error(
                `Failed to apply a change, malformed identifier ${entityId}`
              );
            }
            const exist = yield identifier.exist(quest);
            if (!exist) {
              throw new Error(
                `Failed to apply a change, reference is missing${entityId}`
              );
            }
            yield entityAPI[call]({entityId});
            break;
          }
          default:
            throw new Error(
              `Failed to apply a change, ${prop} is not a valid collection`
            );
        }
        break;
      }
      case 'remove': {
        if (level === 0) {
          throw new Error(
            `Failed to apply a change, missing collection propertie in path`
          );
        }
        const prop = change.path;
        const propType = common.getPropType(type, prop);
        const propKind = common.getPropKind(type, prop);
        switch (propKind) {
          case 'properties': {
            throw new Error(
              `Failed to apply a change, cannot "add" into a properties`
            );
          }
          case 'reference':
          case 'value': {
            const call = common.jsifyQuestName(`remove-from-${prop}`);
            const entityId = change.entityId;
            if (!entityId) {
              throw new Error(`Failed to apply a change, missing entityId`);
            }
            const identifier = new SmartId(entityId, propType);
            if (identifier.isMalformed()) {
              throw new Error(
                `Failed to apply a change, malformed identifier ${entityId}`
              );
            }
            const exist = yield identifier.exist(quest);
            if (!exist) {
              throw new Error(`Failed to apply a change, missing ${entityId}`);
            }
            yield entityAPI[call]({entityId});
            break;
          }
          default:
            throw new Error(
              `Failed to apply a change, ${prop} is not a valid collection`
            );
        }
        break;
      }
      default:
        quest.log.warn('Unknow action: ', change.action);
    }
  }
});

Goblin.registerQuest(goblinName, 'delete', function (quest) {});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
