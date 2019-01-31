'use strict';

const goblinName = 'aggregate-updater-worker';
const Goblin = require('xcraft-core-goblin');

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('id', action.get('id'));
  },
};

Goblin.registerQuest(goblinName, 'create', function(quest) {
  quest.do();
});

Goblin.registerQuest(goblinName, 'update-aggregate', function*(
  quest,
  desktopId,
  parentId,
  entity
) {
  const _goblinFeed = {system: true};
  quest.log.verb(`Aggregate updater: updating  ${parentId} ...`);
  try {
    const parentAPI = yield quest.create(parentId, {
      id: parentId,
      desktopId,
      _goblinFeed,
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
