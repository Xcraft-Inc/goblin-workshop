const Goblin = require('xcraft-core-goblin');
const {locks} = require('xcraft-core-utils');
const common = require('./common.js');

function getDefaultButtons(mode, status) {
  if (!mode) {
    // if edit mode ?
    if (status === 'published') {
      return {
        main: {
          glyph: 'solid/check',
          text: 'Terminer',
          quest: '',
        },
        reset: {
          glyph: 'solid/undo',
          text: 'Réinitialiser',
          quest: '',
        },
        archive: {
          glyph: 'solid/archive',
          text: 'Archiver',
          quest: '',
        },
      };
    } else {
      // if draft or archived ?
      return {
        main: {
          glyph: 'solid/check',
          text: 'Publier',
          quest: '',
        },
        reset: {
          glyph: 'solid/undo',
          text: 'Réinitialiser',
          quest: '',
        },
      };
    }
  } else if (mode === 'readonly') {
    if (status === 'published') {
      return {
        main: {
          glyph: 'solid/pencil',
          text: 'Editer',
          quest: '',
        },
        reset: {
          glyph: 'solid/archive',
          text: 'Archiver',
          quest: '',
        },
      };
    } else {
      // if draft or archived ?
      return {
        main: {
          glyph: 'solid/pencil',
          text: 'Editer',
          quest: '',
        },
        reset: {
          glyph: 'solid/check',
          text: 'Publier',
          quest: '',
        },
      };
    }
  } else {
    return {};
  }
}

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
    gadgets,
    onPublish,
    onArchive,
    onSubmit,
    onLoad,
    onDelete,
    onRestore,
    onUpdate,
    firstFieldToFocus,
    buttons,
  } = config;

  let {enable, maxLevel, skip} = config;

  let goblinName = `${type}-${kind}`;

  if (name) {
    goblinName = name;
  }

  if (!enable) {
    enable = {};
  }

  if (!maxLevel) {
    maxLevel = 2;
  }

  if (!skip) {
    skip = [];
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

      const entity = action.get('entity');
      state = state.set(
        '',
        Object.assign(
          {
            id: id,
            entityId: entity.get('id'),
            firstFieldToFocus: action.get('firstFieldToFocus'),
            buttons: {},
            gadgets: action.get('workitemGadgets'),
            version: `v${entity.get('meta.version')} du ${new Date(
              entity.get('meta.createdAt')
            ).toLocaleString()}`,
          },
          initialState,
          hintersTypes
        )
      );

      state = state.set(`private.${type}`, entity);

      if (initialilizer && common.isFunction(initialilizer)) {
        action[type] = entity;
        return initialilizer(state, action);
      } else {
        return state;
      }
    },
    'change-entity': (state, action) => {
      const entity = action.get('entity');
      return state.set('entityId', entity.get('id'));
    },
    change: (state, action) => {
      return state.set(action.get('path'), action.get('newValue'));
    },
    apply: (state, action) => {
      return state.merge('', action.get('patch'));
    },
    'update-buttons': (state, action) => {
      return state.set('buttons', action.get('buttons'));
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
    level,
    stopAtLevel,
    skipped,
    $msg
  ) {
    if (!level) {
      level = 1;
    }
    if (!stopAtLevel) {
      stopAtLevel = maxLevel;
    }
    if (!skipped) {
      skipped = skip;
    }
    console.log('LOADING ', entityId, ' AT LVL ', level - 1, '/', stopAtLevel);

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
    quest.goblin.setX('mode', mode);
    quest.goblin.setX('contextId', contextId);
    quest.goblin.setX('workflowId', workflowId);

    entity = yield quest.me.createEntity({
      entityId,
      entity,
      parentEntity,
      rootAggregateId,
      rootAggregatePath,
      payload,
      mustExist,
    });

    yield quest.me.createHinters();

    yield quest.me.subscribeToEntity();

    const workitemGadgets = {};
    if (gadgets) {
      for (const key of Object.keys(gadgets)) {
        const gadget = gadgets[key];
        const newGadgetId = `${key}@${quest.goblin.id}`;
        workitemGadgets[key] = {id: newGadgetId, type: gadget.type};
        if (gadgets[key].onActions) {
          for (const handler of Object.keys(gadgets[key].onActions)) {
            quest.goblin.defer(
              quest.sub(`${newGadgetId}.${handler}`, (err, msg) => {
                const questName = common.jsifyQuestName(`${key}-${handler}`);
                quest.me[questName](msg.data);
              })
            );
          }
        }
        quest.create(`${gadget.type}-gadget`, {
          id: newGadgetId,
          options: gadget.options || null,
        });
      }
    }

    quest.do({id: quest.goblin.id, entity, firstFieldToFocus, workitemGadgets});

    common.createWaitLoader(quest);

    quest.goblin.defer(
      quest.sub(`${quest.goblin.id}.created`, quest.me.afterCreate)
    );

    yield quest.me.loadGraph({level, stopAtLevel, skipped});
    return quest.goblin.id;
  });

  Goblin.registerQuest(goblinName, 'load-graph', function*(
    quest,
    level,
    stopAtLevel,
    skipped,
    next
  ) {
    const desktopId = quest.goblin.getX('desktopId');
    const mode = quest.goblin.getX('mode');
    const entity = quest.goblin.getX('loadedEntity');
    const created = [];
    const loadGraph = (items, isVal, lvl, stopAt, skipped) => {
      if (lvl > stopAt) {
        return;
      }

      lvl += 1;

      for (const v in items) {
        if (common.referenceUseArity(items[v])) {
          const type = common.getReferenceType(items[v]);
          if (skipped.includes(type)) {
            continue;
          }
          for (const rId of entity.get(v).values()) {
            const entityEditorId = `${type}-workitem${
              mode ? `@${mode}` : ''
            }@${desktopId}@${rId}`;
            const payload = {
              id: entityEditorId,
              desktopId,
              entityId: rId,
              mustExist: true,
              mode: mode,
              level: lvl,
              stopAtLevel: stopAt,
              skipped,
            };
            if (isVal) {
              payload.entity = entity.get(`private.${v}.${rId}`);
            }
            quest.create(entityEditorId, payload, next.parallel());
            created.push(entityEditorId);
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
            forEntity: entity.get('id'),
            entityPath: v,
            entityIds: entity.get(v).toArray(),
            newEntityPayload,
            mode: mode,
            level: lvl,
            stopAtLevel: stopAt,
            skipped,
            parentWorkitemId: quest.goblin.id,
            onAdd,
            onRemove,
            onMove,
            arity: common.getReferenceArity(items[v]),
          };
          if (isVal) {
            payload.rootAggregateId = entity.get('meta.rootAggregateId');
            payload.rootAggregatePath = entity
              .get('meta.rootAggregatePath')
              .toArray()
              .concat(['private', v]);
          }
          quest.create(pluginId, payload, next.parallel());
          created.push(pluginId);
        } else if (entity.get(v) !== null) {
          const type = common.getReferenceType(items[v]);
          if (skipped.includes(type)) {
            continue;
          }
          const editorId = `${type}-workitem${
            mode ? `@${mode}` : ''
          }@${desktopId}@${entity.get(v)}`;
          const payload = {
            id: editorId,
            mustExist: true,
            mode: mode,
            level: lvl,
            stopAtLevel: stopAt,
            skipped,
            desktopId,
          };
          if (isVal) {
            payload.entityId = entity.get(v);
            payload.entity = entity.get(`private.${v}.${entity.get(v)}`);
          } else {
            payload.entityId = entity.get(v);
          }
          //Prevent loop
          if (editorId !== quest.goblin.id) {
            quest.create(editorId, payload);
            created.push(editorId);
          }
        }
      }
    };

    if (entity.get('meta.references')) {
      loadGraph(
        entity.get('meta.references').toJS(),
        false,
        level,
        stopAtLevel,
        skipped
      );
    }

    if (entity.get('meta.values')) {
      loadGraph(
        entity.get('meta.values').toJS(),
        true,
        level,
        stopAtLevel,
        skipped
      );
    }

    yield next.sync();
    quest.log.verb(`Workitem loading graph [DONE]`);
    quest.goblin.setX('createdByGraph', created);
  });

  Goblin.registerQuest(goblinName, 'create-entity', function*(
    quest,
    entityId,
    entity,
    parentEntity,
    rootAggregateId,
    rootAggregatePath,
    payload,
    mustExist
  ) {
    quest.goblin.setX('entityId', entityId);
    const desktopId = quest.goblin.getX('desktopId');
    const mode = quest.goblin.getX('mode');

    const createArgs = Object.assign(
      {
        id: entityId,
        entity: entity ? entity : null,
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
    yield entityAPI.waitLoaded();
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
    return entity;
  });

  Goblin.registerQuest(goblinName, 'create-hinters', function(quest) {
    const desktopId = quest.goblin.getX('desktopId');
    const mode = quest.goblin.getX('mode');

    if (hinters && (!mode || enable['hinters'])) {
      Object.keys(hinters).forEach(h => {
        quest.create(`${h}-hinter`, {
          id: `${h}-finder@${quest.goblin.id}`,
          desktopId,
          workitemId: quest.goblin.id,
        });
      });
    }
  });

  Goblin.registerQuest(goblinName, 'subscribe-to-entity', function(quest) {
    const entity = quest.goblin.getX('loadedEntity');
    const mode = quest.goblin.getX('mode');
    let entitySubs = quest.goblin.getX('entitySubs');

    if (!entitySubs) {
      entitySubs = [];
    }

    for (const unsub of entitySubs) {
      unsub();
    }

    quest.goblin.setX('entitySubs', []);

    if (buttons && (mode !== 'backend' || enable['buttons'])) {
      entitySubs.push(
        quest.sub(`${entity.get('id')}.changed`, quest.me.updateButtons)
      );
    }

    if (onUpdate && (!mode || enable['onUpdate'])) {
      entitySubs.push(
        quest.sub(`${entity.get('id')}.changed`, quest.me.update)
      );
    }

    quest.goblin.setX('entitySubs', entitySubs);
  });

  Goblin.registerQuest(goblinName, 'wait-loaded', common.waitLoadedQuest);
  Goblin.registerQuest(goblinName, 'after-create', function*(quest) {
    const entity = quest.goblin.getX('loadedEntity');
    const mode = quest.goblin.getX('mode');

    if (buttons && (mode !== 'backend' || enable['buttons'])) {
      quest.me.updateButtons();
    }
    if (onUpdate && (!mode || enable['onUpdate'])) {
      quest.me.update();
    }
    if (onLoad && (!mode || mode !== 'backend' || enable['onLoad'])) {
      yield quest.me.onLoad({entity});
    }
    quest.evt('loaded');
  });

  common.registerHinters(goblinName, hinters);

  //Impl. local plugins action quests
  if (plugins) {
    for (const type of Object.keys(plugins)) {
      if (plugins[type].actions) {
        for (const actionName of Object.keys(plugins[type].actions)) {
          const actionQuest = plugins[type].actions[actionName];
          Goblin.registerQuest(goblinName, actionName, actionQuest);
        }
      }
    }
  }

  //Impl. gadgets
  if (gadgets) {
    for (const key of Object.keys(gadgets)) {
      //Gogo gadgeto stylo!
      Goblin.registerQuest(goblinName, `use-${key}`, function*(
        quest,
        action,
        payload
      ) {
        const gadgetId = quest.goblin.getState().get(`gadgets.${key}.id`);
        const api = quest.getAPI(gadgetId);
        yield api[action](payload);
      });
    }
  }

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
        name: `${entity.get('meta.type')}-workitem`,
        description: entity.get('meta.summaries.info'),
        view: 'default',
        icon: 'solid/pencil',
        kind: 'tab',
        isClosable: true,
        payload: {
          entityId: entity.get('id'),
        },
      },
      navigate: true,
    });
  });

  const changeMutex = new locks.RecursiveMutex();
  Goblin.registerQuest(goblinName, 'change-entity', function*(
    quest,
    entityId,
    entity,
    parentEntity,
    rootAggregateId,
    rootAggregatePath,
    payload,
    level,
    stopAtLevel,
    skipped,
    mustExist
  ) {
    const oldEntityId = quest.goblin.getX('entityId');
    if (oldEntityId === entityId) {
      return;
    }
    const requestId = quest.uuidV4();
    yield changeMutex.lock(requestId);
    quest.defer(() => changeMutex.unlock(requestId));
    if (!level) {
      level = 1;
    }
    if (!stopAtLevel) {
      stopAtLevel = maxLevel;
    }
    if (!skipped) {
      skipped = skip;
    }
    const createdByGraph = quest.goblin.getX('createdByGraph');
    yield quest.kill([oldEntityId].concat(createdByGraph));

    entity = yield quest.me.createEntity({
      entityId,
      entity,
      parentEntity,
      rootAggregateId,
      rootAggregatePath,
      payload,
      mustExist,
    });

    yield quest.me.subscribeToEntity();

    quest.do({entity});
    yield quest.me.loadGraph({level, stopAtLevel, skipped});
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
        description: entity.get('meta.summaries.info') || entity.get('meta.id'),
        view: 'default',
        icon: 'solid/pencil',
        kind: 'tab',
        isClosable: true,
        payload: {
          entityId: entity.get('id'),
          rootAggregateId: entity.get('meta.rootAggregateId'),
          rootAggregatePath: entity.get('meta.rootAggregatePath'),
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
        {
          const cancelToken = yield quest.me.submitEntity({entity});
          if (quest.isCanceled(cancelToken)) {
            console.log('CLOSE CANCELED');
            return cancelToken;
          }
          quest.evt('validated', entity);
        }
        break;
      case 'publish':
        {
          const cancelToken = yield quest.me.publishEntity({entity});
          if (quest.isCanceled(cancelToken)) {
            console.log('CLOSE CANCELED');
            return cancelToken;
          }
          quest.evt('published', entity);
        }
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

  if (buttons) {
    Goblin.registerQuest(goblinName, 'buttons', buttons);
    Goblin.registerQuest(goblinName, 'update-buttons', function*(quest) {
      const mode = quest.goblin.getX('mode');
      const state = yield quest.me.getEntityState();
      const status = state.get('meta.status');
      const buttons = yield quest.me.buttons({
        buttons: getDefaultButtons(mode, status),
        mode,
        status,
      });
      if (buttons) {
        quest.do({buttons});
      }
    });
  } else {
    Goblin.registerQuest(goblinName, 'update-buttons', function*(quest) {
      const mode = quest.goblin.getX('mode');
      const state = yield quest.me.getEntityState();
      const status = state.get('meta.status');
      const buttons = getDefaultButtons(mode, status);
      if (buttons) {
        quest.do({buttons});
      }
    });
  }

  if (onUpdate) {
    Goblin.registerQuest(goblinName, 'update', onUpdate);
  }

  Goblin.registerQuest(goblinName, 'get-entity-state', function*(quest) {
    const entityId = quest.goblin.getX('entityId');
    // try locally
    const state = quest.getState(entityId);
    if (state) {
      return state;
    }
    const eAPI = quest.getAPI(entityId);
    return yield eAPI.get();
  });

  Goblin.registerQuest(goblinName, 'delete-entity', function*(quest) {
    let cancelToken = null;
    if (onDelete) {
      cancelToken = yield quest.me.onDelete();
    }
    if (quest.isCanceled(cancelToken)) {
      return cancelToken;
    }
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.deleteEntity();
    quest.release(quest.goblin.id);
    return null;
  });

  Goblin.registerQuest(goblinName, 'archive-entity', function*(quest) {
    const mode = quest.goblin.getX('mode');
    let cancelToken = null;
    if (onArchive && (!mode || enable['onArchive'])) {
      cancelToken = yield quest.me.onArchive();
    }
    if (quest.isCanceled(cancelToken)) {
      return cancelToken;
    }
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.archiveEntity();
    return null;
  });

  Goblin.registerQuest(goblinName, 'publish-entity', function*(quest) {
    const mode = quest.goblin.getX('mode');
    let cancelToken = null;
    if (onPublish && (!mode || enable['onPublish'])) {
      cancelToken = yield quest.me.onPublish();
    }
    if (quest.isCanceled(cancelToken)) {
      return cancelToken;
    }
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.publishEntity();
    return null;
  });

  Goblin.registerQuest(goblinName, 'submit-entity', function*(quest) {
    const mode = quest.goblin.getX('mode');
    let cancelToken = null;
    if (onSubmit && (!mode || enable['onPublish'])) {
      cancelToken = yield quest.me.onSubmit();
    }
    if (quest.isCanceled(cancelToken)) {
      return cancelToken;
    }
    return null;
  });

  Goblin.registerQuest(goblinName, 'restore-entity', function*(quest) {
    const mode = quest.goblin.getX('mode');
    let cancelToken = null;
    if (onRestore && (!mode || enable['onRestore'])) {
      cancelToken = yield quest.me.onRestore();
    }
    if (quest.isCanceled(cancelToken)) {
      return cancelToken;
    }
    const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
    yield entityAPI.restoreEntity();
    return null;
  });

  Goblin.registerQuest(goblinName, 'delete', function(quest) {
    const entitySubs = quest.goblin.getX('entitySubs');
    for (const unsub of entitySubs) {
      unsub();
    }
  });

  return Goblin.configure(goblinName, {}, logicHandlers);
};
