'use strict';

const goblinName = 'entity-flow-updater';
const Goblin = require('xcraft-core-goblin');
const {JobQueue} = require('xcraft-core-utils');

// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(goblinName, 'init', function (quest) {
  console.log(
    '\x1b[32m%s\x1b[0m',
    'Goblin-Workshop: Entity Flow Updater [RUNNING]'
  );

  const flowQueue = new JobQueue(
    'entity flow updater',
    function* ({work, resp}) {
      yield resp.cmd(`${goblinName}.start-worker`, work);
    },
    Number.MAX_VALUE,
    {waitOn: ['workshop', 'business']}
  );

  quest.goblin.defer(
    quest.sub(
      `*::*.(publish|restore|archive|trash)-<entity-flow-change-requested>`,
      function (err, {msg, resp}) {
        flowQueue.push({
          id: msg.id,
          work: {...msg.data},
          resp,
        });
      }
    )
  );
});

Goblin.registerQuest(goblinName, 'change-entity-status', function* (
  quest,
  desktopId,
  entityId,
  rootAggregateId,
  rootAggregatePath,
  verb
) {
  yield quest.me.startWorker({
    desktopId,
    entityId,
    rootAggregateId,
    rootAggregatePath,
    verb,
  });
});

Goblin.registerQuest(goblinName, 'start-worker', function* (
  quest,
  desktopId,
  entityId,
  rootAggregateId,
  rootAggregatePath,
  verb
) {
  const workerId = `entity-flow-updater-worker@${quest.uuidV4()}@${entityId}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId: quest.getSystemDesktop(),
    });
    yield workerAPI.changeStatus({
      verb,
      desktopId: quest.getSystemDesktop(),
      entityId,
      rootAggregateId,
      rootAggregatePath,
    });
  } finally {
    yield quest.kill([workerId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
