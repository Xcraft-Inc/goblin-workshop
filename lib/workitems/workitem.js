const Goblin = require('xcraft-core-goblin');
const {locks} = require('xcraft-core-utils');
const _ = require('lodash');
const common = require('./common.js');
const Shredder = require('xcraft-core-shredder');
const {buildPeers} = require('../entity-builder/peers.js');

const defaultButtons = {
  edit: {
    published: new Shredder([
      {
        id: 'validate',
        glyph: 'solid/check',
        text: 'Terminer',
      },
      {
        id: 'reset',
        glyph: 'solid/undo',
        text: 'Réinitialiser',
      },
      {
        id: 'archive',
        glyph: 'solid/archive',
        text: 'Archiver',
      },
    ]),
    draftArchived: new Shredder([
      {
        id: 'publish',
        glyph: 'solid/check',
        text: 'Publier',
      },
      {
        id: 'reset',
        glyph: 'solid/undo',
        text: 'Réinitialiser',
      },
    ]),
  },
  readonly: {
    published: new Shredder([
      {
        id: 'edit',
        glyph: 'solid/pencil',
        text: 'Editer',
      },
      {
        id: 'archive',
        glyph: 'solid/archive',
        text: 'Archiver',
      },
    ]),
    draftArchived: new Shredder([
      {
        id: 'edit',
        glyph: 'solid/pencil',
        text: 'Editer',
      },
      {
        id: 'publish',
        glyph: 'solid/check',
        text: 'Publier',
      },
    ]),
  },
};

function getDefaultButtons(mode, status) {
  if (!mode) {
    // edit mode
    if (status === 'published') {
      return defaultButtons.edit.published;
    } else {
      // draft or archived
      return defaultButtons.edit.draftArchived;
    }
  } else if (mode === 'readonly') {
    if (status === 'published') {
      return defaultButtons.readonly.published;
    } else {
      // draft or archived
      return defaultButtons.readonly.draftArchived;
    }
  } else {
    return new Shredder([]);
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
      return state.set(
        '',
        Object.assign(
          {
            id: id,
            entityId: action.get('entityId'),
            firstFieldToFocus: action.get('firstFieldToFocus'),
            //???? buttons: new Shredder([]),
            buttons: null,
            gadgets: action.get('workitemGadgets'),
            version: '1', //must be reimpl.
          },
          initialState
        )
      );
    },
    'after-create': (state, action) => {
      const entity = action.get('entity');
      state = state.set(`private.${type}`, entity);
      return state.set('entityId', entity.get('id'));
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

    quest.log.info(
      'LOADING ',
      entityId,
      ' AT LVL ',
      level - 1,
      '/',
      stopAtLevel
    );

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
    quest.goblin.setX('alive', true);
    quest.goblin.setX('mode', mode);
    quest.goblin.setX('level', level);
    quest.goblin.setX('contextId', contextId);
    quest.goblin.setX('workflowId', workflowId);
    quest.goblin.setX('createParams', {
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
    });

    if (mode !== 'readonly' && mode !== 'backend') {
      yield quest.me.createHinters();
    }

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
        yield quest.create(`${gadget.type}-gadget`, {
          id: newGadgetId,
          options: gadget.options || null,
        });
      }
    }

    quest.do({id: quest.goblin.id, firstFieldToFocus, workitemGadgets});

    common.createWaitLoader(quest);

    quest.goblin.setX(
      'unsubCreated',
      quest.sub(`${quest.goblin.id}.created`, quest.me.afterCreate)
    );

    quest.goblin.setX('loadGraphParams', {level, stopAtLevel, skipped});
    return quest.goblin.id;
  });

  Goblin.registerQuest(goblinName, 'create-hinters', function*(quest, next) {
    const desktopId = quest.goblin.getX('desktopId');
    const mode = quest.goblin.getX('mode');

    if (hinters && (!mode || enable['hinters'])) {
      Object.keys(hinters).forEach(h => {
        quest.create(
          `${h}-hinter`,
          {
            id: `${h}-finder@${quest.goblin.id}`,
            desktopId,
            workitemId: quest.goblin.id,
          },
          next.parallel()
        );
      });
    }
    yield next.sync();
  });

  Goblin.registerQuest(goblinName, 'wait-loaded', common.waitLoadedQuest);

  common.registerHinters(goblinName, hinters);

  //Impl. local plugins action quests
  if (plugins) {
    for (const type of Object.keys(plugins)) {
      if (plugins[type].actions) {
        for (const actionName of Object.keys(plugins[type].actions)) {
          const actionQuest = plugins[type].actions[actionName];
          common.registerQuests(goblinName, {[actionName]: actionQuest});
        }
      }
    }
  }

  //Impl. gadgets
  if (gadgets) {
    for (const key of Object.keys(gadgets)) {
      //Gogo gadgeto stylo!
      common.registerQuests(goblinName, {
        [`use-${key}`]: function*(quest, action, payload) {
          const gadgetId = quest.goblin.getState().get(`gadgets.${key}.id`);
          const api = quest.getAPI(gadgetId);
          yield api[action](payload);
        },
      });
    }
  }

  const changeMutex = new locks.RecursiveMutex();
  const baseQuests = {
    'after-create': function*(quest) {
      const unsub = quest.goblin.getX('unsubCreated');
      if (!unsub(true)) {
        /* This unsub has failed...
         *
         * HACK: skip this second .created event because two events were
         * on the event bus. We should find a way in order to prevent sending
         * two events but it's not trivial (it's not related to the createMutex
         * which is used correctly in core-goblin).
         */
        return;
      }

      const {
        entityId,
        desktopId,
        entity,
        parentEntity,
        rootAggregateId,
        rootAggregatePath,
        payload,
        mustExist,
      } = quest.goblin.getX('createParams');

      const createdEntity = yield quest.me.createEntity({
        entityId,
        entity,
        parentEntity,
        rootAggregateId,
        rootAggregatePath,
        payload,
        mustExist,
      });
      if (!createdEntity) {
        return quest.cancel();
      }
      quest.do({entity: createdEntity});
      const level = quest.goblin.getX('level');
      const mode = quest.goblin.getX('mode');
      if (level === 1 && mode !== 'backend') {
        yield quest.me.subscribeToEntity();
      }
      quest.evt('workitem-loadgraph-requested', {
        workitemId: quest.goblin.id,
        desktopId,
      });
    },
    'load-graph': function*(quest, recycle, next) {
      const desktopId = quest.goblin.getX('desktopId');
      const mode = quest.goblin.getX('mode');
      const entity = quest.goblin.getX('loadedEntity');
      if (!entity) {
        return quest.cancel();
      }

      const {level, stopAtLevel, skipped} = quest.goblin.getX(
        'loadGraphParams'
      );

      const loadGraph = (items, isVal, lvl, stopAt, skipped, peers) => {
        for (const v in items) {
          if (common.referenceUseArity(items[v])) {
            const type = common.getReferenceType(items[v]);
            if (skipped.includes(type)) {
              continue;
            }

            // In backend mode, we load only entities in graph
            if (mode === 'backend') {
              for (const e of peers[v]) {
                const rId = e.get('id');
                const payload = {
                  id: rId,
                  desktopId,
                  entityId: rId,
                  entity: e,
                  rootAggregateId: e.get('meta.rootAggregateId'),
                  rootAggregatePath: e.get('meta.rootAggregatePath').toArray(),
                };
                quest.create(rId, payload, next.parallel());
              }
              continue;
            } else {
              for (const e of peers[v]) {
                const rId = e.get('id');
                const entityEditorId = `${type}-workitem${
                  mode ? `@${mode}` : ''
                }@${desktopId}@${rId}`;
                const payload = {
                  id: entityEditorId,
                  desktopId,
                  entityId: rId,
                  entity: e,
                  mustExist: true,
                  mode: mode,
                  level: lvl + 1,
                  stopAtLevel: stopAt,
                  skipped,
                };

                quest.create(entityEditorId, payload, next.parallel());
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
                level: lvl + 1,
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

              if (recycle) {
                const editorAPI = quest.getAPI(pluginId);
                editorAPI.changeEntities(payload, next.parallel());
              } else {
                quest.create(pluginId, payload, next.parallel());
              }
            }
          } else if (entity.get(v) !== null) {
            const type = common.getReferenceType(items[v]);
            if (skipped.includes(type)) {
              continue;
            }

            if (mode === 'backend') {
              const e = peers[v];
              const rId = e.get('id');
              //Prevent loop
              if (rId !== entity.get('id')) {
                const payload = {
                  id: rId,
                  desktopId,
                  entityId: rId,
                  entity: e,
                  rootAggregateId: e.get('meta.rootAggregateId'),
                  rootAggregatePath: e.get('meta.rootAggregatePath').toArray(),
                };
                quest.create(rId, payload, next.parallel());
              }
            } else {
              const editorId = `${type}-workitem${
                mode ? `@${mode}` : ''
              }@${desktopId}@${entity.get(v)}`;
              //Prevent loop
              if (editorId !== quest.goblin.id) {
                const payload = {
                  id: editorId,
                  entityId: entity.get(v),
                  entity: peers[v],
                  mustExist: true,
                  mode: mode,
                  level: lvl + 1,
                  stopAtLevel: stopAt,
                  skipped,
                  desktopId,
                };
                quest.create(editorId, payload, next.parallel());
              }
            }
          }
        }
      };

      if (level <= stopAtLevel) {
        const peers = yield buildPeers(quest, entity);
        if (entity.get('meta.references')) {
          loadGraph(
            entity.get('meta.references').toJS(),
            false,
            level,
            stopAtLevel,
            skipped,
            peers
          );
        }

        if (entity.get('meta.values')) {
          loadGraph(
            entity.get('meta.values').toJS(),
            true,
            level,
            stopAtLevel,
            skipped,
            peers
          );
        }

        if (mode === 'backend') {
          const entitiesAPI = yield next.sync();
          if (entitiesAPI) {
            for (const api of entitiesAPI.values()) {
              api.loadGraph(
                {
                  level: level + 1,
                  stopAtLevel: stopAtLevel,
                  skipped,
                },
                next.parallel()
              );
            }
            yield next.sync();
          }
        } else {
          yield next.sync();
        }
      }
      quest.evt('loaded');
    },
    'after-load': function*(quest) {
      const entity = quest.goblin.getX('loadedEntity');
      if (!entity) {
        return quest.cancel();
      }
      const mode = quest.goblin.getX('mode');

      if (onLoad && (!mode || mode !== 'backend' || enable['onLoad'])) {
        yield quest.me.onLoad({entity});
      }

      //Only if root workitem
      if (quest.goblin.getX('level') === 1) {
        if (!mode || mode === 'readonly' || enable['buttons']) {
          yield quest.me.updateButtons();
        }
      }
    },
    'create-entity': function*(
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
    },
    'change-entity': function*(
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
      yield changeMutex.lock(quest.goblin.id);
      quest.defer(() => changeMutex.unlock(quest.goblin.id));
      console.log('CHANGE START', entityId);
      if (!level) {
        level = 1;
      }
      if (!stopAtLevel) {
        stopAtLevel = maxLevel;
      }
      if (!skipped) {
        skipped = skip;
      }
      entity = yield quest.me.createEntity({
        entityId,
        entity,
        parentEntity,
        rootAggregateId,
        rootAggregatePath,
        payload,
        mustExist,
      });

      const mode = quest.goblin.getX('mode');
      if (level === 1 && mode !== 'backend') {
        yield quest.me.subscribeToEntity();
      }

      quest.do({entity});

      quest.evt('loaded');
      yield quest.me.afterLoad();
      yield quest.me.loadGraph({recycle: true});

      console.log('CHANGE END', entityId);
    },
    'subscribe-to-entity': function*(quest) {
      yield quest.cmd('workitem-updater.subscribe', {
        workitemId: quest.goblin.id,
        desktopId: quest.getDesktop(),
        entityId: quest.goblin.getState().get('entityId'),
      });
    },
    'unsubscribe-to-entity': function*(quest) {
      yield quest.cmd('workitem-updater.unsubscribe', {
        workitemId: quest.goblin.id,
        desktopId: quest.getDesktop(),
        entityId: quest.goblin.getState().get('entityId'),
      });
    },
    'open-wizard': common.openWizard,
    'open-entity-workitem': function(quest, entity, desktopId) {
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
    },
    change: function(quest, path, newValue) {
      if (hinters[path]) {
        return;
      }
      quest.do();
      quest.evt('changed', {id: quest.goblin.id});
    },
    edit: function(quest, entity, desktopId) {
      const desk = quest.getAPI(desktopId);
      const nameId = quest.goblin.id.split('@');
      desk.addWorkitem({
        workitem: {
          name: nameId[0],
          description:
            entity.get('meta.summaries.info') || entity.get('meta.id'),
          view: 'default',
          icon: 'solid/pencil',
          kind: 'tab',
          isClosable: true,
          payload: {
            entityId: entity.get('id'),
            rootAggregateId: entity.get('meta.rootAggregateId'),
            rootAggregatePath: entity.get('meta.rootAggregatePath').toArray(),
          },
        },
        navigate: true,
      });
    },
    'update-buttons': function*(quest) {
      const alive = quest.goblin.getX('alive');
      if (!alive) {
        return quest.cancel();
      }
      const mode = quest.goblin.getX('mode');
      const state = yield quest.me.getEntityState();
      if (!state) {
        return quest.cancel();
      }

      const status = state.get('meta.status');
      let newButtons = getDefaultButtons(mode, status);
      if (buttons) {
        const configButtons = yield quest.me.buttons({
          buttons: newButtons,
          mode,
          status,
        });
        if (configButtons) {
          newButtons = configButtons;
        }
      }
      quest.do({buttons: newButtons});
    },
    close: function*(quest, kind, desktopId, contextId) {
      quest.log.info('CLOSE REQUESTED');
      const level = quest.goblin.getX('level');
      if (!desktopId) {
        desktopId = quest.goblin.getX('desktopId');
      }
      if (!contextId) {
        contextId = quest.goblin.getX('contextId');
      }
      const entity = yield quest.me.getEntityState();

      //Only root has button workflow enabled
      if (level === 1) {
        // Pre-unsub, if entity change during close (ex. publishing hooks), we don't wont to trigger
        // updates on workitem, we are in closing state now
        yield quest.me.unsubscribeToEntity();

        switch (kind) {
          case 'terminate':
            quest.evt('terminated', entity);
            break;
          case 'validate':
            {
              const cancelToken = yield quest.me.submitEntity({entity});
              if (quest.isCanceled(cancelToken)) {
                quest.log.info('CLOSE CANCELED');
                // restore sub
                yield quest.me.subscribeToEntity();
                return cancelToken;
              }
              quest.evt('validated', entity);
            }
            break;
          case 'publish':
            {
              const cancelToken = yield quest.me.publishEntity({entity});
              if (quest.isCanceled(cancelToken)) {
                quest.log.info('CLOSE CANCELED');
                // restore sub
                yield quest.me.subscribeToEntity();
                return cancelToken;
              }
              quest.evt('published', entity);
            }
            break;
        }
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
    },
  };

  common.registerQuests(goblinName, baseQuests);

  const entityHelperQuests = {
    'get-entity-state': function(quest) {
      const entityId = quest.goblin.getX('entityId');
      // try locally
      if (entityId) {
        const state = quest.getState(entityId);
        if (state) {
          return state;
        }
      }
      quest.log.warn('Workitem is unloading, getEntityState as failed');
      return null;
    },
    'get-entity': common.getEntityQuest,
    'get-entities': common.getEntitiesQuest,
    'load-entity': common.loadEntityQuest,
  };

  common.registerQuests(goblinName, entityHelperQuests);

  const entityFlowQuests = {
    'delete-entity': function*(quest) {
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
    },
    'archive-entity': function*(quest) {
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
    },
    'publish-entity': function*(quest) {
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
    },
    'submit-entity': function*(quest) {
      const mode = quest.goblin.getX('mode');
      let cancelToken = null;
      if (onSubmit && (!mode || enable['onPublish'])) {
        cancelToken = yield quest.me.onSubmit();
      }
      if (quest.isCanceled(cancelToken)) {
        return cancelToken;
      }
      return null;
    },
    'restore-entity': function*(quest) {
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
    },
  };

  common.registerQuests(goblinName, entityFlowQuests);

  if (onSubmit) {
    common.registerQuests(goblinName, {'on-submit': onSubmit});
  }

  if (onArchive) {
    common.registerQuests(goblinName, {'on-archive': onArchive});
  }

  if (onPublish) {
    common.registerQuests(goblinName, {'on-publish': onPublish});
  }

  if (onLoad) {
    common.registerQuests(goblinName, {'on-load': onLoad});
  }

  if (onDelete) {
    common.registerQuests(goblinName, {'on-delete': onDelete});
  }

  if (onRestore) {
    common.registerQuests(goblinName, {'on-restore': onRestore});
  }

  if (buttons) {
    common.registerQuests(goblinName, {buttons: buttons});
  }

  if (onUpdate) {
    common.registerQuests(goblinName, {update: onUpdate});
  }

  Goblin.registerQuest(goblinName, 'delete', function*(quest) {
    const level = quest.goblin.getX('level');
    const mode = quest.goblin.getX('mode');
    if (level === 1 && mode !== 'backend') {
      //TODO: Check if really needed
      yield quest.cmd('workitem-updater.unsubscribe', {
        workitemId: quest.goblin.id,
        desktopId: quest.getDesktop(),
        entityId: quest.goblin.getState().get('entityId'),
      });
    }
  });

  return Goblin.configure(goblinName, {}, logicHandlers);
};
