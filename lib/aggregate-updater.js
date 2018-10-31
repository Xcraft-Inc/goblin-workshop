'use strict';

const goblinName = 'aggregate-updater';
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
    'Goblin-Workshop: Aggregate updater [RUNNING]'
  );
  quest.goblin.defer(
    quest.sub(
      '*::*.update-aggregate-requested',
      watt(function*(err, msg, next) {
        const parentId = msg.data.parentId;
        const entity = msg.data.entity;
        const desktopId = msg.data.desktopId;
        const workerId = `aggregate-updater-worker@${quest.uuidV4()}`;
        const workerAPI = yield quest.create(workerId, {
          id: workerId,
          desktopId,
          $orcName: msg.orcName,
        });
        yield workerAPI.updateAggregate({
          parentId,
          desktopId,
          entity,
          $orcName: msg.orcName,
        });
        yield quest.kill([workerId]);
      })
    )
  );
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
