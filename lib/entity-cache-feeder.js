'use strict';

const goblinName = 'entity-cache-feeder';
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
      'Goblin-Workshop: Entity Cache Feeder [RUNNING]'
    );
    const requested = new EventEmitter();
    quest.goblin.defer(
      quest.sub('*::*.hydrate-entity-requested', function(err, {msg}) {
        const entityId = msg.data.entityId;
        const rootAggregateId = msg.data.rootAggregateId;
        const rootAggregatePath = msg.data.rootAggregatePath;
        const desktopId = msg.data.desktopId;
        const muteChanged = msg.data.muteChanged;
        const muteHydrated = msg.data.muteHydrated;
        const options = msg.data.options;
        const notify = msg.data.notify;
        const requestId = msg.data.requestId;

        requested.emit('start-worker', {
          desktopId,
          requestId,
          entityId,
          rootAggregateId,
          rootAggregatePath,
          muteChanged,
          muteHydrated,
          notify,
          options,
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
  ['*::*.hydrate-entity-requested']
);

Goblin.registerQuest(goblinName, 'start-worker', function*(
  quest,
  desktopId,
  requestId,
  entityId,
  rootAggregateId,
  rootAggregatePath,
  muteChanged,
  muteHydrated,
  notify,
  options
) {
  const id = entityId;

  const workerId = `entity-cache-feeder-worker@${quest.uuidV4()}@${id}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });
    yield workerAPI.feedCache({
      desktopId,
      entityId,
      rootAggregateId,
      rootAggregatePath,
      muteChanged,
      muteHydrated,
      options,
      notify,
    });
  } catch (ex) {
    throw ex;
  } finally {
    yield quest.kill([workerId]);
    quest.evt(`${requestId}-hydrate.done`);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
