'use strict';

const goblinName = 'entity-cache-feeder';
const Goblin = require('xcraft-core-goblin');

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
      quest.me.feedCache({desktopId, entity, $orcName: msg.orcName});
    })
  );
});

Goblin.registerQuest(goblinName, 'feed-cache', function*(
  quest,
  desktopId,
  entity
) {
  const id = entity.get('id');
  quest.log.verb(`Entity Cache Feeder: hydrating  ${id} ...`);
  try {
    const entityAPI = yield quest.create(id, {
      id: id,
      desktopId: desktopId,
      mustExist: true,
      entity,
      rootAggregateId: entity.get('meta.rootAggregateId'),
      rootAggregatePath: entity.get('meta.rootAggregatePath'),
    });
    yield entityAPI.hydrate();
    yield entityAPI.persist();
    quest.log.verb(`Entity Cache Feeder: hydrating  ${id} [DONE]`);
  } catch (e) {
    quest.log.err(`Entity Cache Feeder: error during cache feeding
    ${e}`);
  } finally {
    yield quest.kill([id]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
