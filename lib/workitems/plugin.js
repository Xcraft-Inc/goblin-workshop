const Goblin = require('xcraft-core-goblin');
const {jsify} = require('xcraft-core-utils').string;
const common = require('./common.js');
const busClient = require('xcraft-core-busclient').getGlobal();

module.exports = (config) => {
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
    'create': (state, action) => {
      const initialState = {
        id: action.get('id'),
        forEntity: action.get('forEntity'),
        entityPath: action.get('entityPath'),
        title: action.get('title'),
        editorWidget: action.get('workitem'),
        arity: action.get('arity'),
        mode: action.get('mode'),
        extendedIds: [],
        selectedIds: [],
        type,
      };
      return state.set('', initialState);
    },
    'change-entities': (state, action) => {
      return state.set('forEntity', action.get('forEntity'));
    },
  };

  //HOOKS

  Goblin.registerQuest(goblinName, 'on-add', function* (quest, entity, next) {
    const onAdd = quest.goblin.getX('onAdd');
    if (onAdd) {
      if (common.isGenerator(onAdd)) {
        yield* onAdd(quest, entity, next);
      } else {
        onAdd(quest, entity);
      }
    }
  });

  Goblin.registerQuest(goblinName, 'on-remove', function* (
    quest,
    entity,
    next
  ) {
    const onRemove = quest.goblin.getX('onRemove');
    if (onRemove) {
      if (common.isGenerator(onRemove)) {
        yield* onRemove(quest, entity, next);
      } else {
        onRemove(quest, entity);
      }
    }
  });

  Goblin.registerQuest(goblinName, 'on-move', function* (
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

  Goblin.registerQuest(goblinName, 'create', function* (
    quest,
    desktopId,
    forEntity,
    entityPath,
    parentWorkitemId,
    newEntityPayload,
    mode,
    level,
    stopAtLevel,
    onAdd,
    onRemove,
    onMove,
    workitem,
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

    if (!workitem) {
      workitem = editorWidget;
    }

    quest.goblin.setX('editors', []);
    quest.goblin.setX('desktopId', desktopId);
    quest.goblin.setX('forEntity', forEntity);
    quest.goblin.setX('entityPath', entityPath);
    quest.goblin.setX('newEntityPayload', newEntityPayload);
    quest.goblin.setX('parentWorkitemId', parentWorkitemId);
    quest.goblin.setX('mode', mode);
    quest.goblin.setX('workitem', workitem);
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
      entityPath,
      title,
      arity,
      mode,
      workitem,
    });

    yield quest.me.subscribe();

    return quest.goblin.id;
  });

  Goblin.registerQuest(
    goblinName,
    'subscribe',
    function (quest, $msg) {
      const forEntity = quest.goblin.getX('forEntity');
      const existing = quest.goblin.getX('subscription');
      if (existing) {
        //Unsub
        existing();
      }

      const subscription = quest.sub(
        `*::${forEntity}.collection-changed`,
        function* (err, {msg}, next) {
          /*if (msg.orcName === $msg.orcName) {
          return;
        }*/
          yield busClient.command.send(
            `${goblinName}.onCollectionChanged`,
            Object.assign({id: quest.goblin.id}, msg.data),
            $msg.orcName,
            next,
            {forceNested: true}
          );
        }
      );
      quest.goblin.setX('subscription', subscription);
    },
    ['*::*.collection-changed']
  );

  Goblin.registerQuest(goblinName, 'onCollectionChanged', function* (
    quest,
    entityType,
    eventType,
    entityId,
    beforeId
  ) {
    if (!entityType) {
      entityType = entityId.split('@')[0];
    }

    if (entityType === type) {
      switch (eventType) {
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
          yield quest.me.clear({skipClear: true});

          break;
      }
    }
  });

  Goblin.registerQuest(goblinName, 'change-entities', function* (
    quest,
    forEntity,
    entityPath,
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

  Goblin.registerQuest(goblinName, 'add', function* (
    quest,
    entityId,
    remote,
    skipAdd,
    beforeId,
    payload
  ) {
    const editors = quest.goblin.getX('editors');
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
    }

    const workitem = quest.goblin.getX('workitem');
    const entityEditorId = `${workitem}${
      mode ? `@${mode}` : ''
    }@${desktopId}@${entityId}`;

    editors.push(entityEditorId);
    const rootAggregateId = quest.goblin.getX('rootAggregateId');
    const parentEntity = rootAggregateId === null ? null : forEntityId;
    if (newEntity) {
      editor = yield quest.create(entityEditorId, {
        id: entityEditorId,
        desktopId,
        entityId: entityId,
        parentEntity,
        mode: mode,
        rootAggregateId,
        rootAggregatePath: rootAggregatePath.concat([entityId]),
        payload: newEntityPayload,
      });
    } else {
      editor = yield quest.create(entityEditorId, {
        id: entityEditorId,
        desktopId,
        entityId: entityId,
        mode: mode,
        parentEntity,
        rootAggregateId,
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
    }
  });

  Goblin.registerQuest(goblinName, 'remove', function* (
    quest,
    entityId,
    remote,
    skipRemove
  ) {
    const forEntityId = quest.goblin.getX('forEntity');
    const forEntityAPI = quest.getAPI(forEntityId);

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

    const desktopId = quest.goblin.getX('desktopId');
    const workitem = quest.goblin.getX('workitem');
    const entityEditorId = `${workitem}@${desktopId}@${entityId}`;
    const editors = quest.goblin.getX('editors');
    const editorIndex = editors.indexOf(entityEditorId);
    if (editorIndex > -1) {
      editors.splice(editorIndex, 1);
    }
    yield quest.kill([entityEditorId]);
  });

  Goblin.registerQuest(goblinName, 'clear', function* (quest, skipClear) {
    const forEntityId = quest.goblin.getX('forEntity');
    if (!skipClear) {
      const forEntityAPI = quest.getAPI(forEntityId);
      const method = methodBuilder('clear', quest.goblin.getX('entityPath'));
      quest.log.dbg(method);
      yield forEntityAPI[method]();
    }
    let editors = quest.goblin.getX('editors');
    yield quest.kill(editors);
    editors = [];
  });

  Goblin.registerQuest(goblinName, 'call', function* (
    quest,
    entityId,
    call,
    payload
  ) {
    const mode = quest.goblin.getX('mode');
    const desktopId = quest.goblin.getX('desktopId');
    const workitem = quest.goblin.getX('workitem');

    const entityEditorId = `${workitem}${
      mode ? `@${mode}` : ''
    }@${desktopId}@${entityId}`;
    const api = quest.getAPI(entityEditorId);
    yield api[call](payload);
  });

  Goblin.registerQuest(goblinName, 'do-action', function* (quest, action) {
    const parentWorkitemId = quest.goblin.getX('parentWorkitemId');
    const service = parentWorkitemId.split('@')[0];
    yield quest.cmd(`${service}.${action}`, {
      id: parentWorkitemId,
      pluginId: quest.goblin.id,
    });
  });

  Goblin.registerQuest(goblinName, 'get-for-entity-id', function (quest) {
    return quest.goblin.getX('forEntity');
  });

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'get-entity-state', common.getEntityState);

  Goblin.registerQuest(goblinName, 'edit', function* (
    quest,
    entityId,
    view,
    currentLocation
  ) {
    const entity = yield quest.me.getEntity({entityId});
    const deskId = quest.goblin.getX('desktopId');
    const workitem = quest.goblin.getX('workitem');

    const desk = quest.getAPI(deskId);
    yield desk.addWorkitem({
      workitem: {
        id: quest.uuidV4(),
        name: workitem,
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
      currentLocation,
    });
  });

  Goblin.registerQuest(goblinName, 'open-wizard', common.openWizard);

  Goblin.registerQuest(goblinName, 'compact-all', function (quest) {
    quest.do();
  });

  Goblin.registerQuest(goblinName, 'drag', function* (quest, fromId, toId) {
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

  Goblin.registerQuest(goblinName, 'delete', function (quest) {
    const existing = quest.goblin.getX('subscription');
    if (existing) {
      //Unsub
      existing();
    }
  });

  return Goblin.configure(goblinName, {}, logicHandlers);
};
