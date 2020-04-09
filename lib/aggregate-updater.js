'use strict';

const goblinName = 'aggregate-updater';
const Goblin = require('xcraft-core-goblin');
const {JobQueue} = require('xcraft-core-utils');
// Define initial logic values
const logicState = {
  id: goblinName,
};

// Define logic handlers according rc.json
const logicHandlers = {};

Goblin.registerQuest(
  goblinName,
  'init',
  function (quest, $msg) {
    console.log(
      '\x1b[32m%s\x1b[0m',
      'Goblin-Workshop: Aggregate updater [RUNNING]'
    );
    const updaterQueue = new JobQueue(
      'aggregate updater',
      ({work, resp}, done) => {
        resp.cmd(`${goblinName}.start-worker`, work, done);
      },
      100
    );

    quest.goblin.defer(
      quest.sub('*::*.update-aggregate-requested', function (err, {msg, resp}) {
        const parentId = msg.data.parentId;
        const entityId = msg.data.entityId;
        const desktopId = msg.data.desktopId;
        const requestedBy = msg.data.requestedBy;
        const muteChanged = msg.data.muteChanged;
        updaterQueue.push({
          id: entityId,
          work: {
            desktopId,
            entityId,
            parentId,
            requestedBy,
            muteChanged,
            $orcName: msg.orcName,
          },
          resp,
        });
      })
    );
  },
  ['*::*.update-aggregate-requested']
);

Goblin.registerQuest(goblinName, 'start-worker', function* (
  quest,
  desktopId,
  entityId,
  parentId,
  requestedBy,
  muteChanged
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
      muteChanged,
    });
  } finally {
    yield quest.kill([workerId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
