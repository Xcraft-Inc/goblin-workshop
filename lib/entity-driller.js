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

Goblin.registerQuest(goblinName, 'init', function (quest) {
  console.log('\x1b[32m%s\x1b[0m', 'Goblin-Workshop: Entity driller [RUNNING]');

  const drillQueue = new JobQueue(
    'driller',
    function* ({work, resp}) {
      yield resp.cmd(`${goblinName}.start-worker`, work);
    },
    2,
    false
  );

  const cacheQueue = new JobQueue(
    'entity cache queue',
    function* ({work, resp}) {
      yield resp.cmd(`${goblinName}.start-cache-worker`, work);
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
});

Goblin.registerQuest(goblinName, 'start-cache-worker', function* (
  quest,
  desktopId,
  entities,
  ttl
) {
  const workerId = `entity-driller-worker@${quest.uuidV4()}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });

    yield workerAPI.cacheEntities({
      desktopId,
      entities,
      ttl,
    });
  } finally {
    yield quest.kill([workerId]);
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
        view,
        ttl,
      });
    } else {
      yield workerAPI.drillDown({
        desktopId,
        entityIds,
        createMissing,
        ttl,
      });
    }
  } finally {
    yield quest.kill([workerId]);
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
