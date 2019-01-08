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

  const delayedWorkerById = {};
  quest.goblin.defer(
    quest.sub('*::*.hydrate-entity-requested', function(err, msg) {
      const entity = msg.data.entity;
      const desktopId = msg.data.desktopId;
      const muteChanged = msg.data.muteChanged;
      const muteHydrated = msg.data.muteHydrated;
      const options = msg.data.options;
      const notify = msg.data.notify;
      const id = entity.get('id');
      if (delayedWorkerById[id]) {
        clearTimeout(delayedWorkerById[id]);
      }

      delayedWorkerById[id] = setTimeout(
        watt(function*() {
          yield quest.me.startWorker({
            desktopId,
            entity,
            muteChanged,
            muteHydrated,
            notify,
            options,
            $orcName: msg.orcName,
          });
          delete delayedWorkerById[id];
        }),
        100
      );
    })
  );
});

Goblin.registerQuest(goblinName, 'start-worker', function*(
  quest,
  desktopId,
  entity,
  muteChanged,
  muteHydrated,
  notify,
  options
) {
  const id = entity.get('id');

  const workerId = `entity-cache-feeder-worker@${quest.uuidV4()}@${id}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });
    yield workerAPI.feedCache({
      desktopId,
      entity,
      muteChanged,
      muteHydrated,
      options,
      notify,
    });
  } catch (ex) {
    throw ex;
  } finally {
    yield quest.kill([workerId]);
    quest.evt(`${id}-hydrate-done`);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
