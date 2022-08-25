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

Goblin.registerQuest(goblinName, 'create', function (quest) {
  quest.do();
});

Goblin.registerQuest(goblinName, 'feed-cache', function* (
  quest,
  desktopId,
  entityId,
  rootAggregateId,
  rootAggregatePath,
  muteChanged,
  muteHydrated,
  options,
  force,
  notify
) {
  const id = entityId;
  if (id === undefined) {
    quest.log.warn('feed-cache: bad entity provided, something goes wrong...');
    return;
  }
  quest.log.verb(`Cache Feeder Worker: hydrating  ${id} ...`);
  try {
    const entityAPI = yield quest.create(id, {
      id: id,
      desktopId: quest.getSystemDesktop(),
      mustExist: true,
      rootAggregateId,
      rootAggregatePath,
    });

    yield entityAPI.hydrate({muteChanged, options, force});
    const persisted = yield entityAPI.persist();
    if (options && options.rebuildValueCache === true) {
      yield entityAPI.rebuild();
    }
    if (notify) {
      const desktop = quest.getAPI(desktopId).noThrow();
      yield desktop.addNotification({
        color: 'green',
        message: `${id} cache feeded`,
      });
    }
    quest.log.verb(`Cache Feeder Worker: hydrating  ${id} [DONE]`);
    if (!muteHydrated) {
      yield entityAPI.emitHydrated({persisted});
    }
  } catch (ex) {
    const err = `Cache Feeder Worker: error during cache feeding, ${
      ex.stack || ex.message || ex
    }`;
    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'delete', function (quest) {});

module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
