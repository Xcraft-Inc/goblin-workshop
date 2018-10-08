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
  quest.goblin.defer(
    quest.sub('*::*.update-aggregate-requested', (err, msg) => {
      const parentId = msg.data.parentId;
      const entity = msg.data.entity;
      const desktopId = msg.data.desktopId;
      quest.me.updateAggregate({
        parentId,
        desktopId,
        entity,
        $orcName: msg.orcName,
      });
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
  } catch (ex) {
    quest.log.err(
      `Entity Cache Feeder: error during cache feeding, ${ex.stack ||
        ex.message ||
        ex}`
    );
  } finally {
    yield quest.kill([id]);
  }
});

Goblin.registerQuest(goblinName, 'update-aggregate', function*(
  quest,
  desktopId,
  parentId,
  entity
) {
  quest.log.verb(`Entity Cache Feeder: updating aggregate  ${parentId} ...`);
  try {
    const parentAPI = yield quest.create(parentId, {
      id: parentId,
      desktopId,
    });
    yield parentAPI.waitLoaded();
    yield parentAPI.updateAggregate({entity});
    quest.log.verb(
      `Entity Cache Feeder: updating aggregate  ${parentId}  [DONE]`
    );
  } catch (ex) {
    quest.log.err(
      `Entity Cache Feeder: error during update aggregate, ${ex.stack ||
        ex.message ||
        ex}`
    );
  } finally {
    yield quest.kill([parentId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
