'use strict';

const goblinName = 'entity-driller';
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
      'Goblin-Workshop: Entity driller [RUNNING]'
    );

    const drillQueue = new JobQueue(
      'driller',
      ({work, resp}, done) => {
        resp.cmd(`${goblinName}.start-worker`, work, done);
      },
      1,
      false
    );

    const cacheQueue = new JobQueue(
      'entity cache queue',
      ({work, resp}, done) => {
        resp.cmd(`${goblinName}.start-cache-worker`, work, done);
      },
      2,
      false
    );

    quest.goblin.defer(
      quest.sub('*::*.drill-down-requested', function (err, {msg, resp}) {
        const entityIds = msg.data.entityIds;
        const createMissing = msg.data.createMissing;
        const view = msg.data.view;
        const desktopId = msg.data.desktopId;
        const ttl = msg.data.ttl;
        drillQueue.push({
          id: msg.id,
          work: {entityIds, createMissing, view, desktopId, ttl},
          resp,
        });
      })
    );

    quest.goblin.defer(
      quest.sub('*::*.cache-entities-requested', function (err, {msg, resp}) {
        const entities = msg.data.entities;
        const desktopId = msg.data.desktopId;
        const ttl = msg.data.ttl;
        cacheQueue.push({
          id: msg.id,
          work: {entities, desktopId, ttl},
          resp,
        });
      })
    );
  },
  ['*::*.drill-down-requested', '*::*.cache-entities-requested']
);

Goblin.registerQuest(goblinName, 'start-cache-worker', function* (
  quest,
  desktopId,
  entities,
  ttl
) {
  const workshopAPI = quest.getAPI('workshop');
  const storage = yield workshopAPI.joinStoragePool({
    desktopId,
    useWeight: 10,
  });
  const workerId = `entity-driller-worker@${quest.uuidV4()}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });

    yield workerAPI.cacheEntities({
      desktopId,
      entities,
      storage,
      ttl,
    });
  } finally {
    yield quest.kill([workerId]);
    const workshopAPI = quest.getAPI('workshop');
    const poolId = storage.split('@')[2];
    yield workshopAPI.leaveStoragePool({desktopId, useWeight: 10, poolId});
  }
});

Goblin.registerQuest(goblinName, 'start-worker', function* (
  quest,
  desktopId,
  entityIds,
  createMissing,
  view,
  ttl
) {
  const workshopAPI = quest.getAPI('workshop');
  const storage = yield workshopAPI.joinStoragePool({
    desktopId,
    useWeight: 10,
  });
  const workerId = `entity-driller-worker@${quest.uuidV4()}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });
    if (view) {
      yield workerAPI.drillView({
        desktopId,
        entityIds,
        storage,
        view,
        ttl,
      });
    } else {
      yield workerAPI.drillDown({
        desktopId,
        entityIds,
        storage,
        createMissing,
        ttl,
      });
    }
  } finally {
    yield quest.kill([workerId]);
    const workshopAPI = quest.getAPI('workshop');
    const poolId = storage.split('@')[2];
    yield workshopAPI.leaveStoragePool({desktopId, useWeight: 10, poolId});
  }
});

Goblin.registerQuest(goblinName, 'drill-down', function (
  quest,
  desktopId,
  entityIds,
  view,
  ttl
) {
  quest.evt('drill-down-requested', {
    entityIds,
    view,
    ttl,
    desktopId: desktopId,
  });
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
