'use strict';

const goblinName = 'entity-cache-feeder';
const Goblin = require('xcraft-core-goblin');
const watt = require('gigawatts');

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
      quest.me.startWorker({
        desktopId,
        entity,
        muteChanged,
        $orcName: msg.orcName,
      });
    })
  );
});

Goblin.registerQuest(goblinName, 'start-worker', function*(
  quest,
  desktopId,
  entity,
  muteChanged
) {
  const workerId = `entity-cache-feeder-worker@${quest.uuidV4()}@${entity.get(
    'id'
  )}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });
    yield workerAPI.feedCache({
      desktopId,
      entity,
      muteChanged,
    });
  } catch (ex) {
    throw ex;
  } finally {
    yield quest.kill([workerId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
