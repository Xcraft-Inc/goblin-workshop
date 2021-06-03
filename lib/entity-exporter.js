'use strict';

const goblinName = 'entity-exporter';
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
  function (quest) {
    console.log(
      '\x1b[32m%s\x1b[0m',
      'Goblin-Workshop: Entity Exporter [RUNNING]'
    );

    const exporterQueue = new JobQueue(
      'entity exporter',
      function* ({work, resp}) {
        yield resp.cmd(`${goblinName}.start-worker`, work);
      },
      100,
      {waitOn: ['workshop']}
    );

    quest.goblin.defer(
      quest.sub(`*::*.entity-export-requested`, function (err, {msg, resp}) {
        const {desktopId, type, query, format, fileName} = msg.data;

        exporterQueue.push({
          id: msg.id,
          work: {desktopId, type, query, format, fileName},
          resp,
        });
      })
    );
  },
  [`*::*.entity-export-requested`]
);

Goblin.registerQuest(goblinName, 'start-worker', function* (
  quest,
  desktopId,
  type,
  query,
  format,
  fileName
) {
  const workerId = `entity-exporter-worker@${quest.uuidV4()}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId: quest.getSystemDesktop(),
    });
    yield workerAPI.export({
      desktopId,
      type,
      query,
      format,
      fileName,
    });
  } finally {
    yield quest.kill([workerId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
