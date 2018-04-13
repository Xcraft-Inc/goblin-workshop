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
    onPublish,
    onArchive,
    onSubmit,
    onLoad,
    onDelete,
    onRestore,
    firstFieldToFocus,
    mainButton,
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
        const entity = action.get('entity');
        Object.keys(hinters).forEach(h => {
          if (hinters[h].fieldValuePath) {
            const value = entity.get(hinters[h].fieldValuePath, null);
            hintersTypes[h] = value;
          }
        });
      }

      const entity = action.get('entity').toJS();
      state = state.set(
        '',
        Object.assign(
          {
            id: id,
            entityId: entity.id,
            firstFieldToFocus: action.get('firstFieldToFocus'),
            mainButton: {},
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
    'update-main-button': (state, action) => {
      return state.set('mainButton', action.get('mainButton'));
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
    mode,
    $msg,
    next
  ) {
    if (!desktopId) {
      throw new Error('Unable to create a workitem without a desktopId');
    }

    if (payload) {
      if (payload.entityId) {
        entityId = payload.entityId;
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
    quest.goblin.setX('mode', mode);
    quest.goblin.setX('contextId', contextId);
    quest.goblin.setX('workflowId', workflowId);

    const createArgs = Object.assign(
      {
        id: entityId,
        entity: entity ? Object.assign({}, entity) : null,
        loadedBy: quest.goblin.id,
        desktopId,
        mustExist: mustExist || false,
        parentEntity: parentEntity,
        rootAggregateId: rootAggregateId,
        rootAggregatePath: rootAggregatePath,
      },
      payload
    );

    quest.log.verb(
      `Workitem loading ${entityId} in mode ${mode ? mode : 'ui'}`
    );

    const entityAPI = yield quest.create(entityId, createArgs);
    if (!entity) {
      entity = yield entityAPI.get();
    } else {
      entity = new Goblin.Shredder(entity);
      if (!entity.has('meta')) {
        throw new Error('Workitem loaded with malformed entity');
      }
    }
    quest.goblin.setX('loadedEntity', entity);
    quest.log.verb(`Workitem loading ${entityId} [DONE]`);

    //TODO: config with mode without hinters
    if (hinters && !mode) {
      Object.keys(hinters).forEach(h => {
        quest.create(`${h}-hinter`, {
          id: `${h}-finder@${quest.goblin.id}`,
          desktopId,
          workitemId: quest.goblin.id,
        });
      });
    }

    if (mainButton && !mode) {
      quest.goblin.defer(
        quest.sub(`${entity.get('id')}.changed`, quest.me.updateMainButton)
      );
    }

    quest.do({id: quest.goblin.id, entity, firstFieldToFocus});
    //TODO: refactor with imm. getter
    entity = entity.toJS();
    quest.goblin.defer(
      quest.sub(`${quest.goblin.id}.created`, quest.me.afterCreate)
    );

    const loadGraph = (items, isVal) => {
      for (const v in items) {
        if (common.referenceUseArity(items[v])) {
          const type = common.getReferenceType(items[v]);
          for (const rId of entity[v]) {
            const entityEditorId = `${type}-workitem${
              mode ? `@${mode}` : ''
            }@${desktopId}@${rId}`;
            const payload = {
              id: entityEditorId,
              desktopId,
              entityId: rId,
              mustExist: true,
              mode: mode,
            };
            if (isVal) {
              payload.entity = entity.private[v][rId];
            }
            quest.create(entityEditorId, payload, next.parallel());
          }

          // Don't create plugins for backend mode
          if (mode === 'backend') {
            continue;
          }

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

          const pluginId = `${type}-plugin${mode ? `@${mode}` : ''}@${
            quest.goblin.id
          }`;
          const payload = {
            id: pluginId,
            desktopId,
            forEntity: entity.id,
            entityIds: entity[v],
            newEntityPayload,
            mode: mode,
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
          const editorId = `${type}-workitem${
            mode ? `@${mode}` : ''
          }@${desktopId}@${entity[v]}`;
          const payload = {
            id: editorId,
            mustExist: true,
            mode: mode,
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
      loadGraph(entity.meta.references, false);
    }

    if (entity.meta.values) {
      loadGraph(entity.meta.values, true);
    }

    yield next.sync();
    quest.log.verb(`Workitem loading graph [DONE]`);
    return quest.goblin.id;
  });

  Goblin.registerQuest(goblinName, 'after-create', function*(quest) {
    const entity = quest.goblin.getX('loadedEntity');
    const mode = quest.goblin.getX('mode');

    if (mainButton && !mode) {
      quest.me.updateMainButton();
    }
    if (onLoad && !mode) {
      yield quest.me.onLoad({entity});
    }
  });

  common.registerHinters(goblinName, hinters);

  if (onSubmit) {
    Goblin.registerQuest(goblinName, 'on-submit', onSubmit);
  }

  if (onArchive) {
    Goblin.registerQuest(goblinName, 'on-archive', onArchive);
  }

  if (onPublish) {
    Goblin.registerQuest(goblinName, 'on-publish', onPublish);
  }

  if (onLoad) {
    Goblin.registerQuest(goblinName, 'on-load', onLoad);
  }

  if (onDelete) {
    Goblin.registerQuest(goblinName, 'on-delete', onDelete);
  }

  if (onRestore) {
    Goblin.registerQuest(goblinName, 'on-restore', onRestore);
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

  Goblin.registerQuest(goblinName, 'open-wizard', common.openWizard);

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
    console.log('CLOSE REQUESTED');
    const entity = yield quest.warehouse.get({
      path: quest.goblin.getX('entityId'),
    });

    switch (kind) {
      case 'terminate':
        quest.evt('terminated', entity);
        break;
      case 'validate':
        yield quest.me.submitEntity({entity});
        quest.evt('validated', entity);
        break;
      case 'publish':
        yield quest.me.publishEntity({entity});
        quest.evt('published', entity);
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

  if (mainButton) {
    Goblin.registerQuest(goblinName, 'main-button', mainButton);
    Goblin.registerQuest(goblinName, 'update-main-button', function*(quest) {
      const mainButton = yield quest.me.mainButton();
      quest.do({mainButton});
    });
  }

  Goblin.registerQuest(goblinName, 'get-entity-state', function*(quest) {
    const eAPI = quest.getAPI(quest.goblin.getX('entityId'));
    return yield eAPI.get();
  });

  Goblin.registerQuest(goblinName, 'delete-entity', function*(quest) {
    let cancelTocken = null;
    if (onDelete) {
      cancelTocken = yield quest.me.onDelete();
    }
    if (cancelTocken && cancelTocken.cancel === true) {
      return;
    }
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.deleteEntity();
    quest.release(quest.goblin.id);
  });

  Goblin.registerQuest(goblinName, 'archive-entity', function*(quest) {
    const mode = quest.goblin.getX('mode');
    let cancelTocken = null;
    if (onArchive && !mode) {
      cancelTocken = yield quest.me.onArchive();
    }
    if (cancelTocken && cancelTocken.cancel === true) {
      return;
    }
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.archiveEntity();
  });

  Goblin.registerQuest(goblinName, 'publish-entity', function*(quest) {
    const mode = quest.goblin.getX('mode');
    let cancelTocken = null;
    if (onPublish && !mode) {
      cancelTocken = yield quest.me.onPublish();
    }
    if (cancelTocken && cancelTocken.cancel === true) {
      return;
    }
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.publishEntity();
  });

  Goblin.registerQuest(goblinName, 'submit-entity', function*(quest) {
    const mode = quest.goblin.getX('mode');
    let cancelTocken = null;
    if (onSubmit && !mode) {
      cancelTocken = yield quest.me.onSubmit();
    }
    if (cancelTocken && cancelTocken.cancel === true) {
      return;
    }
  });

  Goblin.registerQuest(goblinName, 'restore-entity', function*(quest) {
    const mode = quest.goblin.getX('mode');
    let cancelTocken = null;
    if (onRestore && !mode) {
      cancelTocken = yield quest.me.onRestore();
    }
    if (cancelTocken && cancelTocken.cancel === true) {
      return;
    }
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.restoreEntity();
  });

  Goblin.registerQuest(goblinName, 'delete', function*(quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
