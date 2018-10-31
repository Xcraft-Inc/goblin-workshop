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
    quest.sub('*::*.update-aggregate-requested', (err, msg) => {
      const parentId = msg.data.parentId;
      const entity = msg.data.entity;
      const desktopId = msg.data.desktopId;
      quest.me.startWorker({
        desktopId,
        entity,
        parentId,
      });
    })
  );
});

Goblin.registerQuest(goblinName, 'start-worker', function*(
  quest,
  desktopId,
  entity,
  parentId
) {
  const workerId = `aggregate-updater-worker@${quest.uuidV4()}@${entity.get(
    'id'
  )}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });
    yield workerAPI.updateAggregate({
      parentId,
      desktopId,
      entity,
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
