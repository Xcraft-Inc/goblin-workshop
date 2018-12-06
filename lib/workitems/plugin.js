const Goblin = require('xcraft-core-goblin');
const {jsify} = require('xcraft-core-utils').string;
const common = require('./common.js');
const busClient = require('xcraft-core-busclient').getGlobal();

module.exports = config => {
  const {name, type, title, editor} = config;

  let goblinName = `${type}-plugin`;

  if (name) {
    goblinName = name;
  }
  let editorWidget = editor;
  if (!editorWidget) {
    editorWidget = `${type}-workitem`;
  }

  const methodBuilder = (verb, path) =>
    jsify(verb + '-' + (path ? path : type));

  // Define logic handlers according rc.json
  const logicHandlers = {
    ...require('./plugin-logic-handlers.js'),
    create: (state, action) => {
      const initialState = {
        id: action.get('id'),
        forEntity: action.get('forEntity'),
        entityIds: action.get('entityIds'),
        title: action.get('title'),
        editorWidget: editorWidget,
        arity: action.get('arity'),
        mode: action.get('mode'),
        extendedIds: [],
        selectedIds: [],
      };
      return state.set('', initialState);
    },
    'change-entities': (state, action) => {
      const merge = {
        forEntity: action.get('forEntity'),
        entityIds: action.get('entityIds'),
        extendedIds: [],
        selectedIds: [],
      };
      return state.set('entityIds', []).merge('', merge);
    },
    'update-collection': (state, action) => {
      return state.set('entityIds', action.get('entityIds'));
    },
    add: (state, action) => {
      const entityId = action.get('entityId');
      const beforeId = action.get('beforeId');
      if (beforeId) {
        return state
          .push('entityIds', entityId)
          .move('entityIds', entityId, beforeId);
      } else {
        return state.push('entityIds', entityId);
      }
    },
    remove: (state, action) => {
      const entityId = action.get('entityId');
      return state.unpush('entityIds', entityId);
    },
    select: (state, action) => {
      const entityIds = action.get('entityIds');
      const clear = action.get('clear');
      const mode = action.get('mode');

      let newState = state;
      if (clear) {
        newState = newState.clear('selectedIds');
      }

      const selectedIds = newState.get('selectedIds').toArray();
      for (const entityId of entityIds) {
        const indexOf = selectedIds.indexOf(entityId);
        switch (mode) {
          default:
          case 'set':
            if (indexOf === -1) {
              newState = newState.push('selectedIds', entityId);
            }
            break;
          case 'clear':
            if (indexOf !== -1) {
              newState = newState.unpush('selectedIds', entityId);
            }
            break;
          case 'swap':
            if (indexOf === -1) {
              newState = newState.push('selectedIds', entityId);
            } else {
              newState = newState.unpush('selectedIds', entityId);
            }
            break;
        }
      }

      return newState;
    },
    'do-drag': (state, action) => {
      const fromId = action.get('fromId');
      const toId = action.get('toId');
      return state.move('entityIds', fromId, toId);
    },
    reorder: (state, action) => {
      return state.set('entityIds', action.get('entityIds'));
    },
  };

  //HOOKS

  Goblin.registerQuest(goblinName, 'on-add', function*(quest, entity, next) {
    const onAdd = quest.goblin.getX('onAdd');
    if (onAdd) {
      if (common.isGenerator(onAdd)) {
        yield* onAdd(quest, entity, next);
      } else {
        onAdd(quest, entity);
      }
    }
  });

  Goblin.registerQuest(goblinName, 'on-remove', function*(quest, entity, next) {
    const onRemove = quest.goblin.getX('onRemove');
    if (onRemove) {
      if (common.isGenerator(onRemove)) {
        yield* onRemove(quest, entity, next);
      } else {
        onRemove(quest, entity);
      }
    }
  });

  Goblin.registerQuest(goblinName, 'on-move', function*(
    quest,
    fromId,
    toId,
    next
  ) {
    const onMove = quest.goblin.getX('onMove');
    if (onMove) {
      if (common.isGenerator(onMove)) {
        yield* onMove(quest, fromId, toId, next);
      } else {
        onMove(quest, fromId, toId);
      }
    }
  });

  Goblin.registerQuest(goblinName, 'create', function*(
    quest,
    desktopId,
    forEntity,
    entityPath,
    entityIds,
    parentWorkitemId,
    newEntityPayload,
    mode,
    level,
    stopAtLevel,
    onAdd,
    onRemove,
    onMove,
    rootAggregateId,
    rootAggregatePath,
    arity
  ) {
    if (!desktopId) {
      throw new Error(
        `Cannot create plugin for ${forEntity} without a desktopId`
      );
    }

    if (!forEntity) {
      throw new Error(
        'A plugin must be created for an entity, missing parameter forEntity?'
      );
    }

    if (!level) {
      level = 1;
    }

    quest.goblin.setX('desktopId', desktopId);
    quest.goblin.setX('forEntity', forEntity);
    quest.goblin.setX('entityPath', entityPath);
    quest.goblin.setX('newEntityPayload', newEntityPayload);
    quest.goblin.setX('parentWorkitemId', parentWorkitemId);
    quest.goblin.setX('mode', mode);
    quest.goblin.setX('level', level);
    quest.goblin.setX('stopAtLevel', stopAtLevel);
    quest.goblin.setX('onAdd', onAdd);
    quest.goblin.setX('onRemove', onRemove);
    quest.goblin.setX('onMove', onMove);
    quest.goblin.setX(
      'rootAggregateId',
      rootAggregateId ? rootAggregateId : null
    );
    quest.goblin.setX(
      'rootAggregatePath',
      rootAggregatePath ? rootAggregatePath : []
    );
    quest.do({
      id: quest.goblin.id,
      forEntity,
      title,
      entityIds,
      arity,
      mode,
    });

    yield quest.me.subscribe();

    return quest.goblin.id;
  });

  Goblin.registerQuest(goblinName, 'subscribe', function(quest, $msg) {
    const forEntity = quest.goblin.getX('forEntity');
    const existing = quest.goblin.getX('subscription');
    if (existing) {
      //Unsub
      existing();
    }

    const subscription = quest.sub(
      `*::${forEntity}.collection-changed`,
      function*(err, msg, next) {
        if (msg.orcName === $msg.orcName) {
          return;
        }
        yield busClient.command.send(
          `${goblinName}.onCollectionChanged`,
          Object.assign({id: quest.goblin.id}, msg.data),
          $msg.orcName,
          next,
          $msg.transports
        );
      }
    );
    quest.goblin.setX('subscription', subscription);
  });

  Goblin.registerQuest(goblinName, 'onCollectionChanged', function*(
    quest,
    entityType,
    eventType,
    entityId,
    beforeId,
    beforeEntityId
  ) {
    if (!entityType) {
      entityType = entityId.split('@')[0];
    }

    if (entityType === type) {
      switch (eventType) {
        case 'moved':
          yield quest.me.doDrag({
            fromId: entityId,
            toId: beforeEntityId,
          });

          break;

        case 'added':
          yield quest.me.add({
            entityId: entityId,
            beforeId: beforeId,
            skipAdd: true,
          });

          break;

        case 'removed':
          yield quest.me.remove({
            entityId: entityId,
            skipRemove: true,
          });

          break;

        case 'cleared':
          yield quest.me.clear({skipRemove: true});

          break;
      }
    }
  });

  Goblin.registerQuest(goblinName, 'change-entities', function*(
    quest,
    forEntity,
    entityPath,
    entityIds,
    rootAggregateId,
    rootAggregatePath
  ) {
    quest.goblin.setX('forEntity', forEntity);
    quest.goblin.setX('entityPath', entityPath);
    quest.goblin.setX(
      'rootAggregateId',
      rootAggregateId ? rootAggregateId : null
    );
    quest.goblin.setX(
      'rootAggregatePath',
      rootAggregatePath ? rootAggregatePath : []
    );
    yield quest.me.subscribe();
    quest.do();
  });

  Goblin.registerQuest(goblinName, 'update-collection', function*(
    quest,
    entityIds,
    next
  ) {
    const mode = quest.goblin.getX('mode');
    const desktopId = quest.goblin.getX('desktopId');
    const forEntityId = quest.goblin.getX('forEntity');
    const currentEntityIds = quest.goblin
      .getState()
      .get('entityIds')
      .toArray();
    const toRemove = currentEntityIds.filter(r => entityIds.indexOf(r) < 0);
    const toAdd = entityIds.filter(r => currentEntityIds.indexOf(r) < 0);
    quest.do();

    for (const rId of toAdd) {
      const entityEditorId = `${editorWidget}${mode ? `@${mode}` : ''}@${rId}`;
      const rootAggregatePath = quest.goblin.getX('rootAggregatePath');
      quest.create(
        entityEditorId,
        {
          id: entityEditorId,
          desktopId,
          entityId: rId,
          parentEntity: forEntityId,
          mode: quest.goblin.getX('mode'),
          level: quest.goblin.getX('level'),
          stopAtLevel: quest.goblin.getX('stopAtLevel'),
          rootAggregateId: quest.goblin.getX('rootAggregateId'),
          rootAggregatePath: rootAggregatePath.concat([rId]),
        },
        next.parallel()
      );
    }

    if (toAdd.length > 0) {
      yield next.sync();
    }

    for (const rId of toRemove) {
      const entityEditorId = `${editorWidget}@${rId}`;
      quest.release(entityEditorId);
    }
  });

  Goblin.registerQuest(goblinName, 'add', function*(
    quest,
    entityId,
    remote,
    skipAdd,
    beforeId,
    extendOnAdd,
    payload
  ) {
    const mode = quest.goblin.getX('mode');
    const forEntityId = quest.goblin.getX('forEntity');
    const newEntityPayload = payload || quest.goblin.getX('newEntityPayload');
    const desktopId = quest.goblin.getX('desktopId');
    const rootAggregatePath = quest.goblin.getX('rootAggregatePath');

    let editor = null;
    let newEntity = false;

    if (!entityId) {
      entityId = `${type}@${quest.uuidV4()}`;
      newEntity = true;
    } else {
      const entityIds = quest.goblin
        .getState()
        .get('entityIds', [])
        .toArray();
      if (entityIds.indexOf(entityId) !== -1) {
        return;
      }
    }

    yield quest.doSync({entityId});

    const entityEditorId = `${editorWidget}${
      mode ? `@${mode}` : ''
    }@${desktopId}@${entityId}`;

    if (newEntity) {
      editor = yield quest.create(entityEditorId, {
        id: entityEditorId,
        desktopId,
        entityId: entityId,
        parentEntity: forEntityId,
        mode: mode,
        rootAggregateId: quest.goblin.getX('rootAggregateId'),
        rootAggregatePath: rootAggregatePath.concat([entityId]),
        payload: newEntityPayload,
      });
    } else {
      editor = yield quest.create(entityEditorId, {
        id: entityEditorId,
        desktopId,
        entityId: entityId,
        mode: mode,
        parentEntity: forEntityId,
        rootAggregateId: quest.goblin.getX('rootAggregateId'),
        rootAggregatePath: rootAggregatePath.concat([entityId]),
        mustExist: true,
      });
    }

    yield editor.waitLoaded();

    if (!skipAdd) {
      const entityAPI = quest.getAPI(forEntityId);
      const method = methodBuilder('add');
      yield entityAPI[method]({entityId, remote, beforeId});
      const onAdd = quest.goblin.getX('onAdd');
      if (onAdd) {
        const addedEntityAPI = quest.getAPI(entityId);
        const entity = yield addedEntityAPI.get();
        const pwi = quest.goblin.getX('parentWorkitemId');
        const service = pwi.split('@')[0];
        yield quest.cmd(`${service}.${onAdd}`, {id: pwi, [type]: entity});
      }
      if (extendOnAdd) {
        yield quest.me.extend({entityId});
      }
    }
  });

  Goblin.registerQuest(goblinName, 'remove', function*(
    quest,
    entityId,
    remote,
    skipRemove
  ) {
    const forEntityId = quest.goblin.getX('forEntity');
    const forEntityAPI = quest.getAPI(forEntityId);

    const entityIds = quest.goblin
      .getState()
      .get('entityIds', [])
      .toArray();
    if (entityIds.indexOf(entityId) === -1) {
      return;
    }

    if (!skipRemove) {
      const method = methodBuilder('remove');
      yield forEntityAPI[method]({entityId, remote});
      const onRemove = quest.goblin.getX('onRemove');
      if (onRemove) {
        const removedEntityAPI = quest.getAPI(entityId);
        const entity = yield removedEntityAPI.get();
        const pwi = quest.goblin.getX('parentWorkitemId');
        const service = pwi.split('@')[0];
        yield quest.cmd(`${service}.${onRemove}`, {id: pwi, [type]: entity});
      }
    }

    quest.do({entityId});
    const desktopId = quest.goblin.getX('desktopId');
    const entityEditorId = `${editorWidget}@${desktopId}@${entityId}`;
    quest.release(entityEditorId);
  });

  Goblin.registerQuest(goblinName, 'call', function*(
    quest,
    entityId,
    call,
    payload
  ) {
    const mode = quest.goblin.getX('mode');
    const desktopId = quest.goblin.getX('desktopId');
    const entityEditorId = `${editorWidget}${
      mode ? `@${mode}` : ''
    }@${desktopId}@${entityId}`;
    const api = quest.getAPI(entityEditorId);
    yield api[call](payload);
  });

  Goblin.registerQuest(goblinName, 'clear', function*(quest, skipRemove) {
    const desktopId = quest.goblin.getX('desktopId');
    const entityIds = quest.goblin
      .getState()
      .get('entityIds', [])
      .toArray();
    for (const entityId of entityIds) {
      const entityEditorId = `${editorWidget}@${desktopId}@${entityId}`;
      quest.release(entityEditorId);
    }
    yield quest.doSync();
    if (!skipRemove) {
      const forEntityId = quest.goblin.getX('forEntity');
      const forEntityAPI = quest.getAPI(forEntityId);
      const path = quest.goblin.getX('entityPath');
      const method = methodBuilder('clear', path);
      yield forEntityAPI[method]();
    }
  });

  Goblin.registerQuest(goblinName, 'extend', function(quest, entityId) {
    quest.do({entityId});
  });

  Goblin.registerQuest(goblinName, 'collapse', function(quest, entityId) {
    quest.do({entityId});
  });

  Goblin.registerQuest(goblinName, 'select', function(
    quest,
    entityIds,
    clear,
    mode
  ) {
    quest.do({entityIds});
  });

  Goblin.registerQuest(goblinName, 'do-action', function*(quest, action) {
    const parentWorkitemId = quest.goblin.getX('parentWorkitemId');
    const service = parentWorkitemId.split('@')[0];
    yield quest.cmd(`${service}.${action}`, {
      id: parentWorkitemId,
      pluginId: quest.goblin.id,
    });
  });

  Goblin.registerQuest(goblinName, 'get-for-entity-id', function(quest) {
    return quest.goblin.getX('forEntity');
  });

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'get-entity-state', common.getEntityState);

  Goblin.registerQuest(goblinName, 'edit', function*(quest, entityId, view) {
    const entity = yield quest.me.getEntity({entityId});
    const deskId = quest.goblin.getX('desktopId');

    const desk = quest.getAPI(deskId);
    yield desk.addWorkitem({
      workitem: {
        id: quest.uuidV4(),
        name: `${entity.get('meta.type')}-workitem`,
        description: entity.get('meta.summaries.info'),
        view: view || 'default',
        icon: 'solid/pencil',
        kind: 'tab',
        isClosable: true,
        payload: {
          entityId: entityId,
          rootAggregateId: entity.get('meta.rootAggregateId'),
          rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
        },
      },
      navigate: true,
    });
  });

  Goblin.registerQuest(goblinName, 'open-wizard', common.openWizard);

  Goblin.registerQuest(goblinName, 'compact-all', function(quest) {
    quest.do();
  });

  Goblin.registerQuest(goblinName, 'do-drag', function(quest, fromId, toId) {
    quest.do({fromId, toId});
  });

  Goblin.registerQuest(goblinName, 'reorder', function(quest, entityIds) {
    quest.do();
  });

  Goblin.registerQuest(goblinName, 'drag', function*(quest, fromId, toId) {
    const forEntityId = quest.goblin.getX('forEntity');

    const forEntityAPI = quest.getAPI(forEntityId);
    const method = methodBuilder('move');
    yield forEntityAPI[method]({entityId: fromId, beforeEntityId: toId});
    const onMove = quest.goblin.getX('onMove');
    if (onMove) {
      const pwi = quest.goblin.getX('parentWorkitemId');
      const service = pwi.split('@')[0];
      yield quest.cmd(`${service}.${onMove}`, {id: pwi, fromId, toId});
    }
  });

  Goblin.registerQuest(goblinName, 'delete', function(quest) {
    const existing = quest.goblin.getX('subscription');
    if (existing) {
      //Unsub
      existing();
    }
  });

  return Goblin.configure(goblinName, {}, logicHandlers);
};
