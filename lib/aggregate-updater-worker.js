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
  entityId,
  changes
) {
  const SmartId = require('./smartId.js');
  const identifier = new SmartId(entityId, '*');
  if (identifier.isMalformed()) {
    throw new Error('Failed to apply changes, malformed entityId provided');
  }
  const exist = yield identifier.exist(quest);
  if (!exist) {
    throw new Error('Failed to apply changes, entity not found in storage');
  }

  const configurations = require('./entity-builder.js').configurations;
  const type = identifier.type;
  const config = configurations[type];
  if (!config) {
    throw new Error('Entity service configuration not available');
  }

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

  for (const change of changes) {
    //collection.id.collection.id...
    const level = change.path ? change.path.split('.').length : 0;

    if (level > 1) {
      //todo call agg.updater at with subpath
      continue;
    }

    switch (change.action) {
      case 'patch': {
        if (level === 1) {
          throw new Error(
            `Failed to apply a change, cannot patch in collection (${change.path})`
          );
        }
        //TODO: path following ex. licenceIds[{id}]
        yield entityAPI.apply({patch: change.payload});
        break;
      }
      case 'add': {
        const path = change.path;
        //TODO: common.isRef/isVal -> ref/addNewTo
        //TODO: path following ex. licenceIds[{id}].features
        break;
      }
      case 'remove': {
        const path = change.path;
        //TODO: common.isRef/isVal -> unref/delete
        //TOFO: path following ex. licenceIds[{id}].features
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
