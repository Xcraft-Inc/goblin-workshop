'use strict';

const goblinName = 'entity-cache-feeder';
const Goblin = require('xcraft-core-goblin');
const {JobQueue} = require('xcraft-core-utils');
const configurations = require('./entity-builder.js').configurations;
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
      'Goblin-Workshop: Entity Cache Feeder [RUNNING]'
    );

    const feedQueues = {};
    const peerFeedQueues = {};
    for (const config of Object.values(configurations)) {
      const type = config.type;
      feedQueues[type] = new JobQueue(
        `entity cache feeder (${type})`,
        ({work, resp}, done) => {
          resp.cmd(`${goblinName}.start-worker`, work, done);
        },
        1 //One by one is the best!
      );
      peerFeedQueues[type] = new JobQueue(
        `peer entity cache feeder (${type})`,
        ({work, resp}, done) => {
          resp.cmd(`${goblinName}.start-worker`, work, done);
        },
        100
      );
    }

    const cleanQueue = new JobQueue(
      'entity cleaning queue',
      ({work, resp}, done) => {
        resp.cmd(`${goblinName}.start-clean-worker`, work, done);
      },
      250
    );

    quest.goblin.defer(
      quest.sub('*::*.entity-(fix|clean)-requested', function (
        err,
        {msg, resp}
      ) {
        const {
          entityId,
          desktopId,
          rootAggregateId,
          rootAggregatePath,
          patch,
          propsToRemove,
          batchId,
        } = msg.data;

        cleanQueue.push({
          id: entityId,
          work: {
            desktopId,
            entityId,
            rootAggregateId,
            rootAggregatePath,
            patch,
            propsToRemove,
            batchId,
          },
          resp,
        });
      })
    );

    quest.goblin.defer(
      quest.sub('*::*.hydrate-entity-requested', function (err, {msg, resp}) {
        const entityId = msg.data.entityId;
        const rootAggregateId = msg.data.rootAggregateId;
        const rootAggregatePath = msg.data.rootAggregatePath;
        const desktopId = msg.data.desktopId;
        const muteChanged = msg.data.muteChanged;
        const muteHydrated = msg.data.muteHydrated;
        const options = msg.data.options;
        const notify = msg.data.notify;
        const requestId = msg.data.requestId;
        const peerHydrate = msg.data.peerHydrate;

        if (!rootAggregateId) {
          throw new Error(
            'Entity Cache Feeder FAILED with this feed request:',
            msg.data
          );
        }

        const queueType = rootAggregateId.split('@')[0];
        if (!peerHydrate) {
          feedQueues[queueType].push({
            id: entityId,
            work: {
              desktopId,
              requestId,
              entityId,
              rootAggregateId,
              rootAggregatePath,
              muteChanged,
              muteHydrated,
              notify,
              options,
            },
            resp,
          });
        } else {
          peerFeedQueues[queueType].push({
            id: entityId,
            work: {
              desktopId,
              requestId,
              entityId,
              rootAggregateId,
              rootAggregatePath,
              muteChanged,
              muteHydrated,
              notify,
              options,
            },
            resp,
          });
        }
      })
    );
  },
  ['*::*.hydrate-entity-requested']
);

Goblin.registerQuest(goblinName, 'start-worker', function* (
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
  } finally {
    yield quest.kill([workerId]);
    quest.evt(`${requestId}-hydrate.done`);
  }
});

Goblin.registerQuest(goblinName, 'start-clean-worker', function* (
  quest,
  desktopId,
  entityId,
  rootAggregateId,
  rootAggregatePath,
  patch,
  propsToRemove,
  batchId
) {
  const id = entityId;
  const workerId = `entity-clean-worker@${quest.uuidV4()}@${id}`;
  try {
    const workerAPI = yield quest.create(workerId, {
      id: workerId,
      desktopId,
    });
    if (patch) {
      yield workerAPI.patchEntity({
        desktopId,
        entityId,
        rootAggregateId,
        rootAggregatePath,
        patch,
      });
    }
    if (propsToRemove) {
      yield workerAPI.cleanEntity({
        desktopId,
        entityId,
        rootAggregateId,
        rootAggregatePath,
        propsToRemove,
      });
    }
  } finally {
    if (batchId) {
      quest.evt(`${batchId}.done`);
    }
    yield quest.kill([workerId]);
  }
});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
Goblin.createSingle(goblinName);
