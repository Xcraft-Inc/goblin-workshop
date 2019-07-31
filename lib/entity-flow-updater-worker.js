'use strict';

const goblinName = 'entity-flow-updater-worker';
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

Goblin.registerQuest(goblinName, 'change-status', function*(
  quest,
  desktopId,
  requestedBy,
  verb,
  entity
) {
  const id = entity.get('id');
  quest.log.verb(`Entity Flow Updater Worker: changing status for ${id} ...`);
  try {
    const entityAPI = yield quest.create(id, {
      id: id,
      desktopId: quest.getSystemDesktop(),
      mustExist: true,
      entity,
      rootAggregateId: entity.get('meta.rootAggregateId'),
      rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
    });

    yield entityAPI[verb]();
    quest.log.verb(
      `Entity Flow Updater Worker: changing status ${id} [${verb}]`
    );
  } catch (ex) {
    const err = `Entity Flow Updater Worker: error during status change, ${ex.stack ||
      ex.message ||
      ex}`;
    quest.log.err(err);
    throw new Error(err);
  } finally {
    yield quest.kill([id]);
  }
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
