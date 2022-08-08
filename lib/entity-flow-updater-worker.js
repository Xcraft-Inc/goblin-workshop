'use strict';

const goblinName = 'entity-flow-updater-worker';
const Goblin = require('xcraft-core-goblin');

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('id', action.get('id'));
  },
};

Goblin.registerQuest(goblinName, 'create', function (quest) {
  quest.do();
});

//gather values to change
const traverseValues = (aggregate, entitiesToChange) => {
  const values = aggregate.get('meta.values');
  if (values) {
    for (const path of values.keys()) {
      const entityIds = aggregate.get(path);
      if (entityIds) {
        if (typeof entityIds === 'string') {
          const entity = aggregate.get(`private.${path}.${entityIds}`);
          if (entity) {
            traverseValues(entity, entitiesToChange);
            entitiesToChange.push(entity);
          }
        } else {
          for (const entityId of entityIds.values()) {
            const entity = aggregate.get(`private.${path}.${entityId}`);
            if (entity) {
              traverseValues(entity, entitiesToChange);
              entitiesToChange.push(entity);
            }
          }
        }
      }
    }
  }
};

//gather ref to change
const traverseReferences = (aggregate) => {
  let ids = [];
  const references = aggregate.get('meta.references');
  if (references) {
    for (const path of references.keys()) {
      const entityIds = aggregate.get(path);
      if (entityIds) {
        if (typeof entityIds === 'string') {
          //prevent loop
          if (entityIds !== aggregate.get('id')) {
            ids.push(entityIds);
          }
        } else {
          ids = ids.concat(entityIds.toArray());
        }
      }
    }
  }
  return ids;
};

Goblin.registerQuest(goblinName, 'propagate', function* (
  quest,
  desktopId, //system
  verb,
  entityId,
  rootAggregateId,
  rootAggregatePath
) {
  quest.log.verb(
    `Entity Flow Updater Worker: Propagate ${verb} for ${entityId}...`
  );

  try {
    const entityAPI = yield quest.create(entityId, {
      id: entityId,
      desktopId,
      mustExist: true,
      rootAggregateId,
      rootAggregatePath,
    });
    const service = entityId.split('@', 1)[0];
    //call private API
    yield quest.cmd(`${service}._${verb}`, {id: entityId});
    const entity = yield entityAPI.get();
    const entitiesToChange = [];
    traverseValues(entity, entitiesToChange);
    for (const entity of entitiesToChange) {
      const entityId = entity.get('id');
      const rootAggregateId = entity.get('meta.rootAggregateId');
      const rootAggregatePath = entity
        .get('meta.rootAggregatePath')
        .valueSeq()
        .toArray();
      try {
        yield quest.create(entityId, {
          id: entityId,
          desktopId,
          rootAggregateId,
          rootAggregatePath,
        });
        const service = entityId.split('@', 1)[0];
        yield quest.cmd(`${service}._${verb}`, {id: entityId});
      } finally {
        yield quest.kill([entityId]);
      }
    }

    for (const entityId of traverseReferences(entity)) {
      try {
        const api = yield quest.create(entityId, {
          id: entityId,
          desktopId,
        });
        const isInMemory = yield api.isInMemory();
        if (isInMemory) {
          const service = entityId.split('@', 1)[0];
          yield quest.cmd(`${service}.${verb}-entity`, {id: entityId});
        }
      } finally {
        yield quest.kill([entityId]);
      }
    }

    quest.log.verb(
      `Entity Flow Updater Worker: Propagate ${verb} for ${entityId}... [DONE]`
    );
  } catch (ex) {
    const err = `Entity Flow Updater Worker: error during status change, ${
      ex.stack || ex.message || ex
    }`;
    quest.log.err(err);
    throw new Error(err);
  } finally {
    yield quest.kill([entityId]);
  }
});

Goblin.registerQuest(goblinName, 'change-status', function* (
  quest,
  desktopId, //system
  verb,
  entityId,
  rootAggregateId,
  rootAggregatePath
) {
  quest.log.verb(
    `Entity Flow Updater Worker: changing status for ${entityId} ...`
  );

  try {
    const entityAPI = yield quest.create(entityId, {
      id: entityId,
      desktopId,
      mustExist: true,
      rootAggregateId,
      rootAggregatePath,
    });
    const service = entityId.split('@', 1)[0];
    //call private API
    yield quest.cmd(`${service}._${verb}`, {id: entityId});
    const entity = yield entityAPI.get();
    const entitiesToChange = [];
    traverseValues(entity, entitiesToChange);
    for (const entity of entitiesToChange) {
      const entityId = entity.get('id');
      const rootAggregateId = entity.get('meta.rootAggregateId');
      const rootAggregatePath = entity
        .get('meta.rootAggregatePath')
        .valueSeq()
        .toArray();
      try {
        yield quest.create(entityId, {
          id: entityId,
          desktopId,
          mustExist: true,
          rootAggregateId,
          rootAggregatePath,
        });
        const service = entityId.split('@', 1)[0];
        yield quest.cmd(`${service}._${verb}`, {id: entityId});
      } finally {
        yield quest.kill([entityId]);
      }
    }
    quest.log.verb(
      `Entity Flow Updater Worker: changing status ${entityId} [${verb}]`
    );
  } catch (ex) {
    const err = `Entity Flow Updater Worker: error during status change, ${
      ex.stack || ex.message || ex
    }`;
    quest.log.err(err);
    throw new Error(err);
  } finally {
    yield quest.kill([entityId]);
  }
});

Goblin.registerQuest(goblinName, 'delete', function (quest) {});

module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
