'use strict';

const goblinName = 'entity-driller-worker';
const Goblin = require('xcraft-core-goblin');
const xBus = require('xcraft-core-bus');
const watt = require('gigawatts');

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('id', action.get('id'));
  },
};

Goblin.registerQuest(goblinName, 'create', function (quest, desktopId) {
  quest.goblin.setX('desktopId', desktopId);
  quest.do();
});

Goblin.registerQuest(goblinName, 'cache-entities', function* (
  quest,
  desktopId,
  entities,
  ttl,
  next
) {
  quest.log.verb(
    `Entity Driller Worker: caching ${entities.length} entities...`
  );
  try {
    entities.forEach((entity) => {
      const id = entity.get('id');
      const cmd = `${id.split('@', 1)[0]}.create`;
      const {busToken, routingKey} = xBus.getRoutingInfoFromId(cmd, id);

      quest.createFor(
        'driller.cache-entities',
        `goblin-cache@${busToken}`,
        cmd,
        {
          id,
          desktopId: quest.getSystemDesktop(),
          entity,
          _goblinTTL: ttl || 10000,
          _goblinRoutingKey: routingKey,
        },
        next.parallel()
      );
    });
    yield next.sync();
    quest.log.verb(
      `Entity Driller Worker: caching ${entities.length} entities... [DONE]`
    );
  } catch (ex) {
    const err = `Entity Driller Worker: error during cache entity, ${
      ex.stack || ex.message || ex
    }`;

    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'drill-view', function* (
  quest,
  desktopId,
  entityIds,
  view,
  ttl,
  next
) {
  quest.log.verb(
    `Entity Driller Worker: drilling view for ${entityIds.length} entities...`
  );
  try {
    const r = quest.getStorage('rethink');
    const entitiesView = yield r.getView({
      table: entityIds[0].split('@', 1)[0],
      documents: entityIds,
      view,
    });
    for (const entity of entitiesView) {
      watt(function* () {
        const viewId = `entity-view@${entity.id}`;
        const cmd = 'entity-view.create';
        const {busToken, routingKey} = xBus.getRoutingInfoFromId(cmd, viewId);

        const api = yield quest.createFor(
          'list.drill-view',
          `goblin-cache@${busToken}`,
          viewId,
          {
            id: viewId,
            desktopId,
            view,
            entity,
            _goblinTTL: ttl || 45000,
            _goblinRoutingKey: routingKey,
          }
        );
        /* When debugging more than 45s, it's possible to fail here... */
        yield api.mergeView({entity, view});
      })(next.parallel());
    }
    yield next.sync();
    quest.log.verb(
      `Entity Driller Worker: drilling view for ${entityIds.length} entities [DONE]`
    );
  } catch (ex) {
    const err = `Entity Driller Worker: error during drill-down, ${
      ex.stack || ex.message || ex
    }`;

    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'drill-down', function* (
  quest,
  desktopId,
  entityIds,
  createMissing,
  ttl,
  next
) {
  quest.log.verb(
    `Entity Driller Worker: drilling  ${entityIds.length} entities...`
  );
  const workshopAPI = quest.getAPI('workshop');
  try {
    entityIds.forEach((entityInfo) => {
      const _entityId =
        typeof entityInfo === 'string' ? entityInfo : entityInfo.entityId;
      let entityArgs = {mustExist: !createMissing};
      if (typeof entityInfo !== 'string') {
        const {entityId, ...other} = entityInfo;
        entityArgs = other;
      }

      const cmd = `${_entityId.split('@', 1)[0]}.create`;
      const {busToken, routingKey} = xBus.getRoutingInfoFromId(cmd, _entityId);
      workshopAPI.createEntity(
        {
          entityId: _entityId,
          desktopId,
          createFor: `goblin-cache@${busToken}`,
          properties: entityArgs,
          ttl: ttl || 45000,
          routingKey: routingKey,
        },
        next.parallel()
      );
    });
    yield next.sync();
    quest.log.verb(
      `Entity Driller Worker: drilling ${entityIds.length} entities [DONE]`
    );
  } catch (ex) {
    const err = `Entity Driller Worker: error during drill-down, ${
      ex.stack || ex.message || ex
    }`;

    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'delete', function (quest) {});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
