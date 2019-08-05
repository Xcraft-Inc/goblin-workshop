'use strict';

const goblinName = 'entity-driller-worker';
const Goblin = require('xcraft-core-goblin');
const xBus = require('xcraft-core-bus');

// Define initial logic values
const logicState = {};

// Define logic handlers according rc.json
const logicHandlers = {
  create: (state, action) => {
    return state.set('id', action.get('id'));
  },
};

Goblin.registerQuest(goblinName, 'create', function(quest, desktopId) {
  quest.goblin.setX('desktopId', desktopId);
  quest.do();
});

Goblin.registerQuest(goblinName, 'drill-view', function*(
  quest,
  desktopId,
  entityIds,
  view,
  next
) {
  quest.log.verb(
    `Entity Driller Worker: drilling view for ${entityIds.length} entities...`
  );
  try {
    const r = quest.getStorage('rethink');
    const entitiesView = yield r.getView({
      table: entityIds[0].split('@')[0],
      documents: entityIds,
      view,
    });
    entitiesView.forEach(entity => {
      const viewId = `entity-view@${entity.id}`;
      quest.createFor(
        'list.drill-view',
        `goblin-cache@${xBus.getToken()}`,
        viewId,
        {
          id: viewId,
          desktopId,
          view,
          entity,
          _goblinTTL: 45000,
        },
        next.parallel()
      );
    });
    yield next.sync();
    quest.log.verb(
      `Entity Driller Worker: drilling view for ${entityIds.length} entities [DONE]`
    );
  } catch (ex) {
    const err = `Entity Driller Worker: error during drill-down, ${ex.stack ||
      ex.message ||
      ex}`;

    quest.log.err(err);
    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'drill-down', function*(
  quest,
  desktopId,
  entityIds,
  createMissing,
  next
) {
  quest.log.verb(
    `Entity Driller Worker: drilling  ${entityIds.length} entities...`
  );
  try {
    entityIds.forEach(entityInfo => {
      const _entityId =
        typeof entityInfo === 'string' ? entityInfo : entityInfo.entityId;
      let entityArgs = {};
      if (typeof entityInfo !== 'string') {
        const {entityId, ...other} = entityInfo;
        entityArgs = other;
      }

      quest.createFor(
        'list.drill-down',
        `goblin-cache@${xBus.getToken()}`,
        _entityId,
        {
          id: _entityId,
          ...entityArgs,
          mustExist: !createMissing,
          desktopId,
          _goblinTTL: 45000,
        },
        next.parallel()
      );
    });
    yield next.sync();
    quest.log.verb(
      `Entity Driller Worker: drilling ${entityIds.length} entities [DONE]`
    );
  } catch (ex) {
    const err = `Entity Driller Worker: error during drill-down, ${ex.stack ||
      ex.message ||
      ex}`;

    quest.log.err(err);
    throw new Error(err);
  }
});

Goblin.registerQuest(goblinName, 'delete', function(quest) {});

// Singleton
module.exports = Goblin.configure(goblinName, logicState, logicHandlers, {
  schedulingMode: 'background',
});
