'use strict';

const goblinName = 'aggregate-updater';
const Goblin = require('xcraft-core-goblin');
const EventEmitter = require('events');
const $ = require('highland');
const busClient = require('xcraft-core-busclient').getGlobal();
// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(
  goblinName,
  'init',
  function(quest, $msg) {
    console.log(
      '\x1b[32m%s\x1b[0m',
      'Goblin-Workshop: Aggregate updater [RUNNING]'
    );
    const requested = new EventEmitter();
    quest.goblin.defer(
      quest.sub('*::*.update-aggregate-requested', function(err, {msg}) {
        const parentId = msg.data.parentId;
        const entityId = msg.data.entityId;
        const desktopId = msg.data.desktopId;
        const requestedBy = msg.data.requestedBy;
        requested.emit('start-worker', {
          desktopId,
          entityId,
          parentId,
          requestedBy,
          $orcName: msg.orcName,
        });
      })
    );

    $('start-worker', requested)
      .map(work => n => {
        //quest.me.startWorker(work, n);
        busClient.command.send(
          `${goblinName}.start-worker`,
          work,
          $msg.orcName,
          n,
          $msg.transports,
          {forceNested: true}
        );
      })
      .nfcall([])
      .parallel(Number.MAX_VALUE)
      .errors((err, push) => {
        push(null, null);
      })
      .done(() => console.log('end listening'));
  },
  ['*::*.update-aggregate-requested']
);

Goblin.registerQuest(goblinName, 'start-worker', function*(
  quest,
  desktopId,
  entityId,
  parentId,
  requestedBy
) {
  const workerId = `aggregate-updater-worker@${quest.uuidV4()}@${entityId}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });
    yield workerAPI.updateAggregate({
      parentId,
      desktopId,
      entityId,
      requestedBy,
    });
  } finally {
    yield quest.kill([workerId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
