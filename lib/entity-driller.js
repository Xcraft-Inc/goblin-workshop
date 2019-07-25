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
  function(quest) {
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

    quest.goblin.defer(
      quest.sub('*::*.drill-down-requested', function(err, {msg, resp}) {
        const entityIds = msg.data.entityIds;
        const createMissing = msg.data.createMissing;
        const view = msg.data.view;
        const desktopId = msg.data.desktopId;
        const _goblinFeed = msg.data._goblinFeed;
        drillQueue.push({
          id: msg.id,
          work: {entityIds, createMissing, view, desktopId, _goblinFeed},
          resp,
        });
      })
    );
  },
  ['*::*.drill-down-requested']
);

Goblin.registerQuest(goblinName, 'start-worker', function*(
  quest,
  desktopId,
  entityIds,
  createMissing,
  view,
  _goblinFeed
) {
  const workerId = `entity-driller-worker@${quest.uuidV4()}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
      _goblinFeed: {system: true},
    });
    if (view) {
      yield workerAPI.drillView({
        desktopId,
        entityIds,
        view,
        _goblinFeed,
      });
    } else {
      yield workerAPI.drillDown({
        desktopId,
        entityIds,
        createMissing,
        _goblinFeed,
      });
    }
  } catch (ex) {
    throw ex;
  } finally {
    yield quest.kill([workerId]);
  }
});

Goblin.registerQuest(goblinName, 'drill-down', function(
  quest,
  desktopId,
  entityIds,
  view,
  _goblinFeed
) {
  quest.evt('drill-down-requested', {
    entityIds,
    view,
    _goblinFeed,
    desktopId: desktopId,
  });
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
