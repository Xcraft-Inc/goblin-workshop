'use strict';

const goblinName = 'entity-cache-feeder-worker';
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

Goblin.registerQuest(goblinName, 'feed-cache', function*(
  quest,
  desktopId,
  entity,
  muteChanged
) {
  const id = entity.get('id');
  quest.log.verb(`Cache Feeder Worker: hydrating  ${id} ...`);
  try {
    const entityAPI = yield quest.create(id, {
      id: id,
      desktopId: desktopId,
      mustExist: true,
      entity,
      rootAggregateId: entity.get('meta.rootAggregateId'),
      rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
    });
    yield entityAPI.hydrate({muteChanged});
    yield entityAPI.persist();
    quest.log.verb(`Cache Feeder Worker: hydrating  ${id} [DONE]`);
  } catch (ex) {
    const err = `Cache Feeder Worker: error during cache feeding, ${ex.stack ||
      ex.message ||
      ex}`;
    quest.log.err(err);
    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
