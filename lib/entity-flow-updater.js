'use strict';

const goblinName = 'entity-flow-updater';
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
    'Goblin-Workshop: Entity Flow Updater [RUNNING]'
  );
  quest.goblin.defer(
    quest.sub(`*::*.(publish|restore|archive)-requested`, (err, msg) => {
      const verb = msg.data.verb;
      const entity = msg.data.entity;
      const desktopId = msg.data.desktopId;
      quest.me.changeStatus({desktopId, entity, verb, $orcName: msg.orcName});
    })
  );
});

Goblin.registerQuest(goblinName, 'change-status', function*(
  quest,
  desktopId,
  verb,
  entity
) {
  const id = entity.get('id');
  quest.log.verb(`Entity Flow Updater: changing status for ${id} ...`);
  try {
    const entityAPI = yield quest.create(id, {
      id: id,
      desktopId: desktopId,
      mustExist: true,
      entity,
      rootAggregateId: entity.get('meta.rootAggregateId'),
      rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
    });
    yield entityAPI[verb]();
    yield entityAPI.hydrate();
    yield entityAPI.persist();
    quest.log.verb(`Entity Flow Updater: changing status ${id} [DONE]`);
  } catch (ex) {
    quest.log.err(
      `Entity Flow Updater: error during status change, ${ex.stack ||
        ex.message ||
        ex}`
    );
  } finally {
    yield quest.kill([id]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
