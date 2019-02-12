'use strict';

const goblinName = 'aggregate-updater';
const Goblin = require('xcraft-core-goblin');
const EventEmitter = require('events');
const $ = require('highland');

// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(
  goblinName,
  'init',
  function(quest) {
    console.log(
      '\x1b[32m%s\x1b[0m',
      'Goblin-Workshop: Aggregate updater [RUNNING]'
    );
    const requested = new EventEmitter();
    quest.goblin.defer(
      quest.sub('*::*.update-aggregate-requested', function(err, msg) {
        const parentId = msg.data.parentId;
        const entity = msg.data.entity;
        const desktopId = msg.data.desktopId;
        const requestedBy = msg.data.requestedBy;
        requested.emit('start-worker', {
          desktopId,
          entity,
          parentId,
          requestedBy,
          $orcName: msg.orcName,
        });
      })
    );

    $('start-worker', requested)
      .map(work => n => quest.me.startWorker(work, n))
      .nfcall([])
      .parallel(50)
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
  entity,
  parentId,
  requestedBy
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
      requestedBy,
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
