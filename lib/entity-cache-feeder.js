'use strict';

const goblinName = 'entity-cache-feeder';
const Goblin = require('xcraft-core-goblin');
const {locks} = require('xcraft-core-utils');

// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'init', function(quest) {
  console.log(
    '\x1b[32m%s\x1b[0m',
    'Goblin-Workshop: Entity Cache Feeder [RUNNING]'
  );
  quest.goblin.defer(
    quest.sub('*::*.hydrate-entity-requested', (err, msg) => {
      const entity = msg.data.entity;
      const desktopId = msg.data.desktopId;
      const muteChanged = msg.data.muteChanged;
      quest.me.feedCache({
        desktopId,
        entity,
        $orcName: msg.orcName,
        muteChanged,
      });
    })
  );
  quest.goblin.setX('timers', {});
});

Goblin.registerQuest(goblinName, 'feed-cache', function*(
  quest,
  desktopId,
  entity,
  muteChanged
) {
  const id = entity.get('id');
  const timers = quest.goblin.getX('timers');
  if (timers[id]) {
    clearTimeout(timers[id]);
  }
  quest.log.verb(`Entity Cache Feeder: hydrating  ${id} ...`);

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
    quest.log.verb(`Entity Cache Feeder: hydrating  ${id} [DONE]`);
  } catch (ex) {
    quest.log.err(
      `Entity Cache Feeder: error during cache feeding, ${ex.stack ||
        ex.message ||
        ex}`
    );
  } finally {
    timers[id] = setTimeout(() => {
      quest.kill([id]);
      delete timers[id];
    }, 50000);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
