const Goblin = require('xcraft-core-goblin');
const common = require('./common.js');
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

  function jsifyQuestName(quest) {
    return quest.replace(/-([a-z])/g, (m, g1) => g1.toUpperCase());
  }

  const methodBuilder = verb => {
    return jsifyQuestName(verb + '-' + type);
  };

  // Define logic handlers according rc.json
  const logicHandlers = {
    create: (state, action) => {
      const initialState = {
        id: action.get('id'),
        forEntity: action.get('forEntity'),
        entityIds: action.get('entityIds'),
        title: action.get('title'),
        editorWidget: editorWidget,
        arity: action.get('arity'),
        extendedIds: [],
        selectedIds: [],
      };
      return state.set('', initialState);
    },
    'update-collection': (state, action) => {
      return state.set('entityIds', action.get('entityIds'));
    },
    clear: state => {
      return state.set('entityIds', []).set('extendedId', null);
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
    extend: (state, action) => {
      const entityId = action.get('entityId');
      const currentId = state.get('extendedId');
      const extendedIds = state.get('extendedIds').toArray();
      const indexOf = extendedIds.indexOf(entityId);

      if (indexOf !== -1) {
        state = state.unpush('extendedIds', entityId);
      } else {
        state = state.push('extendedIds', entityId);
      }

      if (entityId === currentId) {
        return state.set('extendedId', null); // compact panel
      } else {
        return state.set('extendedId', entityId); // extend panel
      }
    },
    'compact-all': state => {
      return state.set('extendedId', null); // compact all panels
    },
    'do-drag': (state, action) => {
      const fromId = action.get('fromId');
      const toId = action.get('toId');
      return state.move('entityIds', fromId, toId);
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

  Goblin.registerQuest(goblinName, 'create', function(
    quest,
    desktopId,
    forEntity,
    entityIds,
    parentWorkitemId,
    newEntityPayload,
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

    quest.goblin.setX('desktopId', desktopId);
    quest.goblin.setX('forEntity', forEntity);
    quest.goblin.setX('newEntityPayload', newEntityPayload);
    quest.goblin.setX('parentWorkitemId', parentWorkitemId);
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
    quest.do({id: quest.goblin.id, forEntity, title, entityIds, arity});

    const extractEntityId = msg =>
      msg.data.entity ? msg.data.entity.id : msg.data.entityId;
    const extractEntity = msg => (msg.data.entity ? msg.data.entity : null);
    const extractType = msg =>
      msg.data.entity
        ? msg.data.entity.meta.type
        : msg.data.entityId.split('@')[0];

    quest.goblin.defer(
      quest.sub(`*::${forEntity}.plugin`, (err, msg) => {
        const {eventType} = msg.data;

        switch (eventType) {
          case 'moved':
            if (extractType(msg) === type) {
              quest.me.doDrag({
                fromId: msg.data.entityId,
                toId: msg.data.beforeEntityId,
              });
            }
            break;

          case 'added':
            if (extractType(msg) === type) {
              quest.me.add({
                entityId: extractEntityId(msg),
                entity: extractEntity(msg),
                beforeId: msg.data.beforeId,
                skipAdd: true,
              });
            }
            break;

          case 'removed':
            if (extractType(msg) === type) {
              quest.me.remove({
                entityId: extractEntityId(msg),
                skipRemove: true,
              });
            }
            break;

          case 'cleared':
            if (msg.data.type === type) {
              quest.me.clear();
            }
            break;
        }
      })
    );

    return quest.goblin.id;
  });

  Goblin.registerQuest(goblinName, 'update-collection', function(
    quest,
    entityIds
  ) {
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
      const entityEditorId = `${editorWidget}@${rId}`;
      const rootAggregatePath = quest.goblin.getX('rootAggregatePath');
      quest.create(entityEditorId, {
        id: entityEditorId,
        desktopId,
        entityId: rId,
        parentEntity: forEntityId,
        rootAggregateId: quest.goblin.getX('rootAggregateId'),
        rootAggregatePath: rootAggregatePath.concat([rId]),
      });
    }

    for (const rId of toRemove) {
      const entityEditorId = `${editorWidget}@${rId}`;
      quest.release(entityEditorId);
    }
  });

  Goblin.registerQuest(goblinName, 'add', function*(
    quest,
    entityId,
    entity,
    remote,
    skipAdd,
    beforeId
  ) {
    const forEntityId = quest.goblin.getX('forEntity');
    const newEntityPayload = quest.goblin.getX('newEntityPayload');
    const desktopId = quest.goblin.getX('desktopId');
    const entityIds = quest.goblin
      .getState()
      .get('entityIds', [])
      .toArray();
    if (entityIds.indexOf(entityId) !== -1) {
      return;
    }
    if (!entityId) {
      entityId = `${type}@${quest.uuidV4()}`;
      const entityEditorId = `${editorWidget}@${desktopId}@${entityId}`;
      const rootAggregatePath = quest.goblin.getX('rootAggregatePath');
      yield quest.create(entityEditorId, {
        id: entityEditorId,
        desktopId,
        entityId: entityId,
        parentEntity: forEntityId,
        rootAggregateId: quest.goblin.getX('rootAggregateId'),
        rootAggregatePath: rootAggregatePath.concat([entityId]),
        payload: newEntityPayload,
      });
    } else {
      const entityEditorId = `${editorWidget}@${desktopId}@${entityId}`;
      yield quest.create(entityEditorId, {
        id: entityEditorId,
        desktopId,
        entityId: entityId,
        mustExist: true,
        entity: entity,
      });
    }

    if (!skipAdd) {
      const entityAPI = quest.getAPI(forEntityId);
      const method = methodBuilder('add');
      entityAPI[method]({entityId, remote, beforeId});
      const onAdd = quest.goblin.getX('onAdd');
      if (onAdd) {
        if (!entity) {
          const addedEntityAPI = quest.getAPI(entityId);
          entity = yield addedEntityAPI.get();
        }
        const pwi = quest.goblin.getX('parentWorkitemId');
        const service = pwi.split('@')[0];
        quest.cmd(`${service}.${onAdd}`, {id: pwi, [type]: entity});
      }
    }

    if (!remote) {
      quest.dispatch('compact-all');
    }

    quest.do({entityId});
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
      forEntityAPI[method]({entityId, remote});
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

  Goblin.registerQuest(goblinName, 'clear', function(quest) {
    const desktopId = quest.goblin.getX('desktopId');
    const entityIds = quest.goblin
      .getState()
      .get('entityIds', [])
      .toArray();
    for (const entityId of entityIds) {
      const entityEditorId = `${editorWidget}@${desktopId}@$${entityId}`;
      quest.release(entityEditorId);
    }
    quest.do();
  });

  Goblin.registerQuest(goblinName, 'extend', function(quest, entityId) {
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

  Goblin.registerQuest(goblinName, 'get-for-entity-id', function(quest) {
    return quest.goblin.getX('forEntity');
  });

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'get-entity-state', function*(quest) {
    const eAPI = quest.getAPI(quest.goblin.getX('forEntity'));
    return yield eAPI.get();
  });

  Goblin.registerQuest(goblinName, 'edit', function*(quest, entityId) {
    const entity = yield quest.me.getEntity({entityId});
    const deskId = quest.goblin.getX('desktopId');

    const desk = quest.getAPI(deskId);
    desk.addWorkitem({
      workitem: {
        name: `${entity.meta.type}-workitem`,
        description: entity.meta.summaries.info,
        view: 'default',
        icon: 'solid/pencil',
        kind: 'tab',
        isClosable: true,
        payload: {
          entityId: entityId,
          rootAggregateId: entity.meta.rootAggregateId,
          rootAggregatePath: entity.meta.rootAggregatePath,
        },
      },
      navigate: true,
    });
  });

  Goblin.registerQuest(goblinName, 'compact-all', function(quest) {
    quest.do();
  });

  Goblin.registerQuest(goblinName, 'do-drag', function(quest, fromId, toId) {
    quest.do({fromId, toId});
  });

  Goblin.registerQuest(goblinName, 'drag', function(quest, fromId, toId) {
    const forEntityId = quest.goblin.getX('forEntity');

    const forEntityAPI = quest.getAPI(forEntityId);
    const method = methodBuilder('move');
    forEntityAPI[method]({entityId: fromId, beforeEntityId: toId});
    const onMove = quest.goblin.getX('onMove');
    if (onMove) {
      const pwi = quest.goblin.getX('parentWorkitemId');
      const service = pwi.split('@')[0];
      quest.cmd(`${service}.${onMove}`, {id: pwi, fromId, toId});
    }
  });

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
