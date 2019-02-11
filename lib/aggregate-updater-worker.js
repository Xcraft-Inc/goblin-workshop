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

Goblin.registerQuest(goblinName, 'create', function(quest, desktopId) {
  quest.goblin.setX('desktopId', desktopId);
  quest.do();
});

Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

Goblin.registerQuest(goblinName, 'update-aggregate', function*(
  quest,
  desktopId,
  requestedBy,
  parentId,
  entity
) {
  const _goblinFeed = {system: true};
  quest.log.verb(`Aggregate updater: updating  ${parentId} ...`);
  try {
    const parentEntity = yield quest.me.getEntity({
      entityId: parentId,
      privateState: true,
    });
    const parentAPI = yield quest.create(parentId, {
      id: parentId,
      desktopId,
      entity: parentEntity,
      _goblinFeed,
      _goblinCaller: requestedBy,
    });

    yield parentAPI.updateAggregate({entity});
    quest.log.verb(`Aggregate updater: updating   ${parentId}  [DONE]`);
  } catch (ex) {
    const err = `Aggregate updater: error during update , ${ex.stack ||
      ex.message ||
      ex}`;

    quest.log.err(err);
    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
