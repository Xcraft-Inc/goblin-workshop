'use strict';

const goblinName = 'entity-driller';
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
      'Goblin-Workshop: Entity driller [RUNNING]'
    );
    const requested = new EventEmitter();
    quest.goblin.defer(
      quest.sub('*::*.drill-down-requested', function(err, {msg}) {
        const entityIds = msg.data.entityIds;
        const desktopId = msg.data.desktopId;
        const _goblinFeed = msg.data._goblinFeed;
        requested.emit('start-worker', {
          desktopId,
          entityIds,
          _goblinFeed,
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
  ['*::*.drill-down-requested']
);

Goblin.registerQuest(goblinName, 'start-worker', function*(
  quest,
  desktopId,
  entityIds,
  _goblinFeed
) {
  const workerId = `entity-driller-worker@${quest.uuidV4()}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
      _goblinFeed: {system: true},
    });
    yield workerAPI.drillDown({
      desktopId,
      entityIds,
      _goblinFeed,
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
