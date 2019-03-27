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
  entityId,
  rootAggregateId,
  rootAggregatePath,
  muteChanged,
  muteHydrated,
  options,
  notify
) {
  const _goblinFeed = {system: true};
  const id = entityId;
  if (id === undefined) {
    quest.log.warn('feed-cache: bad entity provided, something goes wrong...');
    return;
  }
  quest.log.verb(`Cache Feeder Worker: hydrating  ${id} ...`);
  try {
    const entityAPI = yield quest.create(id, {
      id: id,
      desktopId: desktopId,
      mustExist: true,
      rootAggregateId,
      rootAggregatePath,
      _goblinFeed,
    });

    yield entityAPI.hydrate({muteChanged, options});
    yield entityAPI.persist();
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
      const hydratedEntity = yield entityAPI.get();
      const type = hydratedEntity.get('meta.type');
      quest.evt(`${type}-hydrated`, {entity: hydratedEntity, desktopId});
    }
  } catch (ex) {
    const err = `Cache Feeder Worker: error during cache feeding, ${ex.stack ||
      ex.message ||
      ex}`;
    quest.log.err(err);
    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
