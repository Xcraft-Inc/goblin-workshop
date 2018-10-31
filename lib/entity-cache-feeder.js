'use strict';

const goblinName = 'entity-cache-feeder';
const Goblin = require('xcraft-core-goblin');
const watt = require('watt');

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
    quest.sub(
      '*::*.hydrate-entity-requested',
      watt(function*(err, msg, next) {
        const entity = msg.data.entity;
        const desktopId = msg.data.desktopId;
        const muteChanged = msg.data.muteChanged;
        const workerId = `entity-cache-feeder-worker@${quest.uuidV4()}`;
        const workerAPI = yield quest.create(workerId, {
          id: workerId,
          desktopId,
          $orcName: msg.orcName,
        });
        yield workerAPI.feedCache({
          desktopId,
          entity,
          $orcName: msg.orcName,
          muteChanged,
        });
        yield quest.kill([workerId]);
      })
    )
  );
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
