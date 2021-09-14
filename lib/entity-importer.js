'use strict';

const goblinName = 'entity-importer';
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
    'Goblin-Workshop: Entity Importer [RUNNING]'
  );

  const importerQueue = new JobQueue(
    'entity importer',
    function* ({work, resp}) {
      yield resp.cmd(`${goblinName}.start-worker`, work);
    },
    1
  );

  quest.goblin.defer(
    quest.sub(`*::*.entity-import-requested`, function (err, {msg, resp}) {
      const {desktopId, type, row} = msg.data;

      importerQueue.push({
        id: msg.id,
        work: {desktopId, type, row},
        resp,
      });
    })
  );
});

Goblin.registerQuest(goblinName, 'import-row', function (
  quest,
  desktopId,
  type,
  row
) {
  quest.evt(`entity-import-requested`, {desktopId, type, row});
});

Goblin.registerQuest(goblinName, 'start-worker', function* (
  quest,
  desktopId,
  type,
  row
) {
  const workerId = `entity-importer-worker@${quest.uuidV4()}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId: quest.getSystemDesktop(),
    });
    yield workerAPI.import({
      desktopId: quest.getSystemDesktop(),
      type,
      row,
    });
  } finally {
    yield quest.kill([workerId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
