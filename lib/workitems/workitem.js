const Goblin = require('xcraft-core-goblin');
const common = require('./common.js');

module.exports = config => {
  const {
    type,
    name,
    kind,
    actions,
    quests,
    hinters,
    initialState,
    initialilizer,
    plugins,
    onSubmit,
    onLoad,
    onReload, // XXX: dead code
    onDelete,
    enableHistory,
    firstFieldToFocus,
  } = config;

  let goblinName = `${type}-${kind}`;

  if (name) {
    goblinName = name;
  }

  const logicHandlers = {
    create: (state, action) => {
      const id = action.get('id');

      let hintersTypes = {};
      if (hinters) {
        const entity = new Goblin.Shredder(action.get('entity'));
        Object.keys(hinters).forEach(h => {
          if (hinters[h].fieldValuePath) {
            const value = entity.get(hinters[h].fieldValuePath, null);
            hintersTypes[h] = value;
          }
        });
      }

      const entity = action.get('entity');
      state = state.set(
        '',
        Object.assign(
          {
            id: id,
            entityId: entity.id,
            firstFieldToFocus: action.get('firstFieldToFocus'),
            version: `v${entity.meta.version} du ${new Date(
              entity.meta.createdAt
            ).toLocaleString()}`,
            private: {
              [type]: entity,
            },
          },
          initialState,
          hintersTypes
        )
      );

      if (initialilizer && common.isFunction(initialilizer)) {
        action[type] = entity;
        return initialilizer(state, action);
      } else {
        return state;
      }
    },
    change: (state, action) => {
      return state.set(action.get('path'), action.get('newValue'));
    },
    apply: (state, action) => {
      return state.merge('', action.get('patch'));
    },
    reload: (state, action) => {
      const change = action.get('change');
      if (change.new_val) {
        const entity = new Goblin.Shredder(change.new_val);
        state = state.set(type, change.new_val);
        if (hinters) {
          Object.keys(hinters).forEach(h => {
            if (hinters[h].fieldValuePath) {
              const value = entity.get(hinters[h].fieldValuePath, null);
              state = state.set(h, value);
            }
          });
        }

        if (initialilizer && common.isFunction(initialilizer)) {
          action[type] = change.new_val;
          state = initialilizer(state, action);
        }

        return state;
      } else {
        return state;
      }
    },
    'set-version': (state, action) => {
      return state.set('version', action.get('version'));
    },
  };

  /*if (enableHistory) {
    Goblin.registerQuest (
      goblinName,
      `hinter-validate-${type}-version`,
      function* (quest, selection) {
        const i = quest.openInventory ();
        const entity = quest.getAPI (quest.goblin.getX ('entityId'));
        let patch = selection.payload;
        delete patch.id;
        for (const ref in selection.payload.meta.references) {
          delete patch[ref];
        }
        delete patch.meta;
        yield entity.preview ({patch});
        quest.dispatch ('set-version', {version: selection.text});
      }
    );

    Goblin.registerQuest (goblinName, 'load-versions', function (quest) {
      const versionHinter = quest.getAPI (
        `entity-version-hinter@${quest.goblin.id}`
      );
      versionHinter.search ();
    });

    Goblin.registerQuest (goblinName, 'version', function* (quest) {
      const i = quest.openInventory ();
      const contact = quest.getAPI (quest.goblin.getX ('entityId'));
      yield contact.version ({});
      quest.me.loadVersions ();
      const newVersion = yield contact.getVersion ();
      quest.dispatch ('set-version', {version: newVersion});
    });
  }*/

  if (actions) {
    Object.assign(logicHandlers, actions);
    common.registerActions(goblinName, actions);
  }

  if (quests) {
    common.registerQuests(goblinName, quests);
  }

  Goblin.registerQuest(goblinName, 'create', function*(
    quest,
    desktopId,
    entityId,
    entity,
    parentEntity,
    rootAggregateId,
    rootAggregatePath,
    contextId,
    workflowId,
    payload,
    mustExist,
    $msg,
    next
  ) {
    if (payload) {
      if (payload.entityId) {
        entityId = payload.entityId;
      }
      if (payload.entity) {
        entity = payload.entity;
      }
    }
    if (!entityId) {
      //lookup for and explicit typed id in arguments
      //Manage desktopId collisions exceptions
      if (type === 'desktop') {
        entityId = $msg.data.deskId;
      } else {
        entityId = $msg.data[`${type}Id`];
      }

      if (!entityId) {
        entityId = `${type}@${quest.uuidV4()}`;
      }
    }

    quest.goblin.setX('desktopId', desktopId);
    quest.goblin.setX('entityId', entityId);
    quest.goblin.setX('contextId', contextId);
    quest.goblin.setX('workflowId', workflowId);

    const createArgs = Object.assign(
      {
        id: entityId,
        loadedBy: quest.goblin.id,
        desktopId,
        entity,
        mustExist: mustExist || false,
        parentEntity: entity ? entity.meta.parentEntity : parentEntity,
        rootAggregateId: entity ? entity.meta.rootAggregateId : rootAggregateId,
        rootAggregatePath: entity
          ? entity.meta.rootAggregatePath
          : rootAggregatePath,
      },
      payload
    );

    try {
      console.log('Root workitem loading ', entityId);
      const e = yield quest.create(entityId, createArgs);
      //Accept cached entity
      if (!entity) {
        //lookup for an explicit typed entity in arguments
        entity = $msg.data[type];
        if (!entity) {
          entity = yield e.get();
        }
      }
      if (!entity) {
        throw new Error('Error during loading of ', entityId);
      }
    } catch (err) {
      if (err === 'EENTITY_NOT_FOUND') {
        return quest.cancel();
      } else {
        throw err;
      }
    }

    const createFrom = (items, isVal) => {
      for (const v in items) {
        if (common.referenceUseArity(items[v])) {
          const type = common.getReferenceType(items[v]);
          let newEntityPayload = {};
          let onAdd = null;
          let onRemove = null;
          let onMove = null;

          if (plugins && plugins[type]) {
            if (plugins[type].newEntityPayload) {
              newEntityPayload = plugins[type].newEntityPayload(entity);
            }
            if (plugins[type].onAdd) {
              onAdd = plugins[type].onAdd;
            }
            if (plugins[type].onRemove) {
              onRemove = plugins[type].onRemove;
            }
            if (plugins[type].onMove) {
              onMove = plugins[type].onMove;
            }
          }

          for (const rId of entity[v]) {
            const entityEditorId = `${type}-workitem@${desktopId}@${rId}`;
            const payload = {
              id: entityEditorId,
              desktopId,
              entityId: rId,
              mustExist: true,
            };
            if (isVal) {
              payload.entity = entity.private[v][rId];
            }
            quest.create(entityEditorId, payload, next.parallel());
          }

          const pluginId = `${type}-plugin@${quest.goblin.id}`;
          const payload = {
            id: pluginId,
            desktopId,
            forEntity: entity.id,
            entityIds: entity[v],
            newEntityPayload,
            parentWorkitemId: quest.goblin.id,
            onAdd,
            onRemove,
            onMove,
            arity: common.getReferenceArity(items[v]),
          };
          if (isVal) {
            payload.rootAggregateId = entity.meta.rootAggregateId;
            payload.rootAggregatePath = entity.meta.rootAggregatePath.concat([
              'private',
              v,
            ]);
          }
          quest.create(pluginId, payload, next.parallel());
        } else if (entity[v] !== null) {
          const type = common.getReferenceType(items[v]);
          const editorId = `${type}-workitem@${desktopId}@${entity[v]}`;
          const payload = {
            id: editorId,
            mustExist: true,
            desktopId,
          };
          if (isVal) {
            payload.entityId = v.id;
            payload.entity = entity.private[v][entity[v]];
          } else {
            payload.entityId = entity[v];
          }
          quest.create(editorId, payload);
        }
      }
    };

    if (entity.meta.references) {
      createFrom(entity.meta.references, false);
    }

    if (entity.meta.values) {
      createFrom(entity.meta.values, true);
    }

    if (hinters) {
      Object.keys(hinters).forEach(h => {
        quest.create(`${h}-hinter`, {
          id: `${h}-finder@${quest.goblin.id}`,
          desktopId,
          workitemId: quest.goblin.id,
        });
      });
    }

    /*if (enableHistory) {
      const vHinterId = `entity-version-hinter@${quest.goblin.id}`;
      const versionHinter = yield quest.create (vHinterId, {
        id: vHinterId,
        desktopId,
        workitemId: quest.goblin.id,
        entityId: entity.id,
        type,
        table: entity.meta.type,
      });
      versionHinter.search ();
    }*/

    yield next.sync();
    /*const creations = yield next.sync ();
    if (creations) {
      for (const res of creations) {
        if (quest.isCanceled (res)) {
          //
        }
      }
    }*/

    if (onLoad) {
      yield quest.me.onLoad({entity: entity});
    }

    quest.do({id: quest.goblin.id, entity, firstFieldToFocus});
    return quest.goblin.id;
  });

  common.registerHinters(goblinName, hinters);

  if (onSubmit) {
    Goblin.registerQuest(goblinName, 'submit', onSubmit);
  }

  if (onLoad) {
    Goblin.registerQuest(goblinName, 'on-load', onLoad);
  }

  Goblin.registerQuest(goblinName, 'open-entity-workitem', function(
    quest,
    entity,
    desktopId
  ) {
    const desk = quest.getAPI(desktopId);
    desk.addWorkitem({
      workitem: {
        name: `${entity.meta.type}-workitem`,
        description: entity.meta.summaries.info,
        view: 'default',
        icon: 'solid/pencil',
        kind: 'tab',
        isClosable: true,
        payload: {
          entityId: entity.id,
        },
      },
      navigate: true,
    });
  });

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'change', function(quest, path, newValue) {
    if (hinters[path]) {
      return;
    }
    quest.do();
    quest.evt('changed');
  });

  Goblin.registerQuest(goblinName, 'apply', function(quest, patch) {
    quest.do();
    quest.evt('changed');
  });

  Goblin.registerQuest(goblinName, 'edit', function(quest, entity, desktopId) {
    const desk = quest.getAPI(desktopId);
    const nameId = quest.goblin.id.split('@');
    desk.addWorkitem({
      workitem: {
        name: nameId[0],
        description: entity.meta.summaries.info || entity.meta.id,
        view: 'default',
        icon: 'solid/pencil',
        kind: 'tab',
        isClosable: true,
        payload: {
          entityId: entity.id,
          rootAggregateId: entity.meta.rootAggregateId,
          rootAggregatePath: entity.meta.rootAggregatePath,
        },
      },
      navigate: true,
    });
  });

  Goblin.registerQuest(goblinName, 'close', function*(
    quest,
    kind,
    desktopId,
    contextId
  ) {
    const entity = yield quest.warehouse.get({
      path: quest.goblin.getX('entityId'),
    });

    switch (kind) {
      case 'terminate':
      case 'validate':
        yield quest.cmd(`${type}.publish-entity`, {id: entity.id});
        quest.evt('validated', entity);
        break;
      default:
      case 'cancel':
        yield quest.cmd(`${type}.restore-entity`, {id: entity.id});
        quest.evt('canceled', entity);
        break;
    }

    const desk = quest.getAPI(desktopId);
    const nameId = quest.goblin.id.split('@');

    yield desk.removeWorkitem({
      workitem: {
        id: quest.goblin.id.replace(nameId[0] + '@', ''),
        name: nameId[0],
        kind: 'tab',
        contextId: contextId,
      },
      close: false,
    });

    quest.release(quest.goblin.id);
    quest.evt('closed', entity);
  });

  if (onDelete) {
    Goblin.registerQuest(goblinName, 'custom-delete', onDelete);
  }

  Goblin.registerQuest(goblinName, 'get-entity-state', function*(quest) {
    const eAPI = quest.getAPI(quest.goblin.getX('entityId'));
    return yield eAPI.get();
  });

  Goblin.registerQuest(goblinName, 'delete-entity', function*(quest) {
    if (onDelete) {
      yield quest.me.customDelete();
    }
    const entity = yield quest.warehouse.get({
      path: quest.goblin.getX('entityId'),
    });
    yield quest.cmd(`${type}.delete-entity`, {id: entity.id});
    quest.release(quest.goblin.id);
  });

  Goblin.registerQuest(goblinName, 'archive-entity', function*(quest) {
    const entity = yield quest.warehouse.get({
      path: quest.goblin.getX('entityId'),
    });
    yield quest.cmd(`${type}.archive-entity`, {id: entity.id});
  });

  Goblin.registerQuest(goblinName, 'publish-entity', function*(quest) {
    const entity = yield quest.warehouse.get({
      path: quest.goblin.getX('entityId'),
    });
    yield quest.cmd(`${type}.publish-entity`, {id: entity.id});
  });

  Goblin.registerQuest(goblinName, 'delete', function*(quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
