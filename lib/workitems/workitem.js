//T:2019-04-09

const T = require('goblin-nabu/widgets/helpers/t.js');
const Goblin = require('xcraft-core-goblin');
const {locks} = require('xcraft-core-utils');
const common = require('./common.js');
const Shredder = require('xcraft-core-shredder');
const {buildPeers} = require('../entity-builder/peers.js');
const {configurations} = require('../entity-builder.js');
const watt = require('gigawatts');

const defaultButtons = {
  edit: {
    published: new Shredder([
      {
        id: 'validate',
        glyph: 'solid/check',
        text: T('Terminer'),
      },
      // {
      //   id: 'reset',
      //   glyph: 'solid/undo',
      //   text: T('Réinitialiser'),
      // },
      //- {
      //-   id: 'archive',
      //-   glyph: 'solid/archive',
      //-   text: T('Archiver'),
      //- },
      //- {
      //-   id: 'trash',
      //-   glyph: 'solid/trash',
      //-   text: T('Supprimer'),
      //- },
      {
        id: 'delete',
        glyph: 'solid/trash',
        text: T('Supprimer'),
      },
    ]),
    draftArchived: new Shredder([
      {
        id: 'publish',
        glyph: 'solid/check',
        text: T('Publier'),
      },
      // {
      //   id: 'reset',
      //   glyph: 'solid/undo',
      //   text: T('Réinitialiser'),
      // },
      //- {
      //-   id: 'trash',
      //-   glyph: 'solid/trash',
      //-   text: T('Supprimer'),
      //- },
      {
        id: 'delete',
        glyph: 'solid/trash',
        text: T('Supprimer'),
      },
    ]),
  },
  readonly: {
    published: new Shredder([
      {
        id: 'edit',
        glyph: 'solid/pencil',
        text: T('Editer'),
      },
      //- {
      //-   id: 'archive',
      //-   glyph: 'solid/archive',
      //-   text: T('Archiver'),
      //- },
      {
        id: 'delete',
        glyph: 'solid/trash',
        text: T('Supprimer'),
      },
    ]),
    draftArchived: new Shredder([
      {
        id: 'edit',
        glyph: 'solid/pencil',
        text: T('Editer'),
      },
      {
        id: 'publish',
        glyph: 'solid/check',
        text: T('Publier'),
      },
      //- {
      //-   id: 'trash',
      //-   glyph: 'solid/trash',
      //-   text: T('Supprimer'),
      //- },
      {
        id: 'delete',
        glyph: 'solid/trash',
        text: T('Supprimer'),
      },
    ]),
  },
};

function getDefaultButtons(mode, status) {
  if (status === 'missing') {
    return new Shredder([]);
  }
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

const loadGraph = (
  workitems,
  workitemId,
  toCreate,
  toChange,
  mode,
  recycle,
  plugins,
  desktopId,
  entity
) => (entries, isVal, lvl, stopAt, skipped, peers) => {
  for (const [v, entry] of entries) {
    if (common.referenceUseArity(entry)) {
      const type = common.getReferenceType(entry);
      if (skipped.includes(type)) {
        continue;
      }
      let workitem = `${type}-workitem`;
      if (workitems[type]) {
        workitem = workitems[type];
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
            rootAggregatePath: e
              .get('meta.rootAggregatePath')
              .valueSeq()
              .toArray(),
          };
          toCreate.push({id: rId, payload});
        }
        continue;
      } else {
        for (const e of peers[v]) {
          const rId = e.get('id');
          const entityEditorId = `${workitem}${
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
          toCreate.push({id: entityEditorId, payload});
        }

        let newEntityPayload = {};
        let onAdd = null;
        let onRemove = null;
        let onMove = null;
        let name = type;

        if (plugins && plugins[v]) {
          if (plugins[v].newEntityPayload) {
            newEntityPayload = plugins[v].newEntityPayload(entity);
          }
          if (plugins[v].onAdd) {
            onAdd = plugins[v].onAdd;
          }
          if (plugins[v].onRemove) {
            onRemove = plugins[v].onRemove;
          }
          if (plugins[v].onMove) {
            onMove = plugins[v].onMove;
          }
          if (plugins[v].name) {
            name = plugins[v].name;
          }
        }
        const pluginId = `${name}-plugin${
          mode ? `@${mode}` : ''
        }@${workitemId}`;
        const payload = {
          id: pluginId,
          desktopId,
          forEntity: entity.get('id'),
          entityPath: v,
          entityIds: entity.get(v).valueSeq().toArray(),
          newEntityPayload,
          mode: mode,
          level: lvl + 1,
          stopAtLevel: stopAt,
          skipped,
          parentWorkitemId: workitemId,
          onAdd,
          onRemove,
          onMove,
          workitem,
          arity: common.getReferenceArity(entry),
        };
        if (isVal) {
          payload.rootAggregateId = entity.get('meta.rootAggregateId');
          payload.rootAggregatePath = entity
            .get('meta.rootAggregatePath')
            .valueSeq()
            .toArray()
            .concat(['private', v]);
        }

        if (recycle) {
          toChange.push({id: pluginId, payload});
        } else {
          toCreate.push({id: pluginId, namespace: `${type}-plugin`, payload});
        }
      }
    } else if (entity.get(v) !== null) {
      const type = common.getReferenceType(entry);
      if (skipped.includes(type)) {
        continue;
      }

      let workitem = `${type}-workitem`;
      if (workitems[type]) {
        workitem = workitems[type];
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
            rootAggregatePath: e
              .get('meta.rootAggregatePath')
              .valueSeq()
              .toArray(),
          };
          toCreate.push({id: rId, payload});
        }
      } else {
        const editorId = `${workitem}${
          mode ? `@${mode}` : ''
        }@${desktopId}@${entity.get(v)}`;
        //Prevent loop
        if (editorId !== workitemId) {
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
          toCreate.push({id: editorId, payload});
        }
      }
    }
  }
};

module.exports = (config) => {
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
    lists,
    onPublish,
    onArchive,
    onSubmit,
    onLoad,
    onTrash,
    onRestore,
    onUpdate,
    firstFieldToFocus,
    width,
    buttons,
    entityGraphOnly,
  } = config;

  let {enable, maxLevel, skip, workitems} = config;

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

  if (!workitems) {
    workitems = {};
  }

  const logicHandlers = {
    'create': (state, action) => {
      const id = action.get('id');
      return state.set(
        '',
        Object.assign(
          {
            id: id,
            entityId: action.get('entityId'),
            firstFieldToFocus: action.get('firstFieldToFocus'),
            width: action.get('width'),
            //???? buttons: new Shredder([]),
            buttons: null,
            gadgets: action.get('workitemGadgets'),
            version: '1', //must be reimpl.
          },
          initialState
        )
      );
    },
    'change-entity': (state, action) => {
      const entity = action.get('entity');
      return state.set('entityId', entity.get('id'));
    },
    'set-post-remove': (state, action) => {
      return state.set('postRemove', action.get('postRemove'));
    },
    'change': (state, action) => {
      return state.set(action.get('path'), action.get('newValue'));
    },
    'apply': (state, action) => {
      return state.mergeDeep('', action.get('patch'));
    },
    'update-buttons': (state, action) => {
      return state.set('buttons', action.get('buttons'));
    },
    'reload': (state, action) => {
      const change = action.get('change');
      if (change.new_val) {
        const entity = new Goblin.Shredder(change.new_val);
        state = state.set(type, change.new_val);
        if (hinters) {
          Object.keys(hinters).forEach((h) => {
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

  Goblin.registerQuest(goblinName, 'create', function* (
    quest,
    desktopId,
    entityId,
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
    throwIfNewInstance,
    $msg,
    next
  ) {
    if (throwIfNewInstance) {
      throw new Error('New instance detected');
    }
    if (!level) {
      level = 1;
    }

    if (!stopAtLevel) {
      stopAtLevel = maxLevel;
    }
    if (!skipped) {
      skipped = skip;
    }

    quest.log.dbg(`LOADING ${entityId} AT LVL ${level - 1}/${stopAtLevel}`);

    if (!desktopId) {
      throw new Error(
        `Unable to create the workitem ${quest.goblin.id} without a desktopId`
      );
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

    const workitemGadgets = {};
    const workitemId = quest.goblin.id;
    if (gadgets) {
      for (const key of Object.keys(gadgets)) {
        const gadget = gadgets[key];
        const newGadgetId = `${key}@${quest.goblin.id}`;
        workitemGadgets[key] = {id: newGadgetId, type: gadget.type};
        if (gadgets[key].onActions) {
          for (const handler of Object.keys(gadgets[key].onActions)) {
            quest.goblin.defer(
              quest.sub(`*::${newGadgetId}.${handler}`, function* (
                err,
                {msg, resp}
              ) {
                const questName = common.jsifyQuestName(`${key}-${handler}`);
                yield resp.cmd(`${goblinName}.${questName}`, {
                  id: workitemId,
                  ...msg.data,
                });
              })
            );
          }
        }
        quest.create(
          `${gadget.type}-gadget`,
          {
            id: newGadgetId,
            desktopId,
            options: gadget.options || null,
          },
          next.parallel()
        );
      }
      yield next.sync();
    }

    if (lists) {
      for (const collection of lists) {
        const options = {entityId, path: collection};
        let collectionType = common.getPropType(type, collection);

        if (!collectionType) {
          throw new Error(
            `Workitem config error: lists: ['${collection}'... is not a valid reference/value properties`
          );
        }

        options.pathType = collectionType;
        const collectionConfig = configurations[collectionType];

        if (collectionConfig.orderBy) {
          options.orderBy = collectionConfig.orderBy;
        }

        yield quest.create('list', {
          id: `${collection}-list@${quest.goblin.id}`,
          desktopId,
          table: type,
          options,
        });
      }
    }

    quest.do({
      id: quest.goblin.id,
      firstFieldToFocus,
      width,
      workitemGadgets,
    });

    if (mode !== 'readonly' && mode !== 'backend') {
      yield quest.me.createHinters({});
    }

    common.createWaitLoader(quest);

    quest.goblin.setX('loadGraphParams', {
      level,
      stopAtLevel,
      skipped,
    });
    yield afterCreate(quest, desktopId);
    quest.evt('<load-graph-requested>', {
      desktopId,
      workitemId: quest.goblin.id,
      forDesktopId: desktopId,
      recycle: false,
    });
    quest.log.dbg(
      `LOADING ${entityId} AT LVL ${level - 1}/${stopAtLevel} [DONE]`
    );
    return quest.goblin.id;
  });

  Goblin.registerQuest(goblinName, 'create-hinters', function* (quest, next) {
    const desktopId = quest.goblin.getX('desktopId');
    const mode = quest.goblin.getX('mode');
    if (hinters && (!mode || enable['hinters'])) {
      Object.keys(hinters).forEach((h) => {
        let hName = h;
        let detailWidget = null;
        if (hinters[h].hinter) {
          hName = hinters[h].hinter;
          detailWidget = `${hName}-workitem`;
        }
        if (quest.hasAPI(`${hName}-hinter`)) {
          quest.create(
            `${hName}-hinter`,
            {
              id: `${h}-finder@${quest.goblin.id}`,
              desktopId,
              hinterName: h,
              workitemId: quest.goblin.id,
              detailWidget,
              withDetails: true,
              statusFilter: hinters[h].statusFilter
                ? hinters[h].statusFilter
                : ['published'],
            },
            next.parallel()
          );
        }
      });
      yield next.sync();
    }
  });

  const afterCreate = watt(function* (quest, desktopId) {
    const {
      entityId,
      parentEntity,
      rootAggregateId,
      rootAggregatePath,
      payload,
      mustExist,
    } = quest.goblin.getX('createParams');

    const createdEntity = yield createEntity(
      quest,
      entityId,
      null,
      parentEntity,
      rootAggregateId,
      rootAggregatePath,
      payload,
      mustExist,
      desktopId
    );
    if (!createdEntity) {
      return quest.cancel();
    }
    quest.dispatch('change-entity', {entity: createdEntity});
    const level = quest.goblin.getX('level');
    const mode = quest.goblin.getX('mode');
    if (level === 1 && mode !== 'backend') {
      yield quest.me.subscribeToEntity({entityId: createdEntity.get('id')});
    }
    if (quest.me.afterLoad) {
      yield quest.me.afterLoad();
    }
  });

  const createEntity = watt(function* (
    quest,
    entityId,
    entity,
    parentEntity,
    rootAggregateId,
    rootAggregatePath,
    payload,
    mustExist,
    desktopId
  ) {
    quest.goblin.setX('entityId', entityId);
    const mode = quest.goblin.getX('mode');

    const properties = Object.assign(
      {
        entity: entity ? entity : null,
        loadedBy: quest.goblin.id,
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

    const workshopAPI = quest.getAPI('workshop');
    yield workshopAPI.createEntity({
      id: entityId,
      desktopId,
      createFor: quest.goblin.id,
      properties,
    });

    const entityAPI = quest.getAPI(entityId);

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

  const loadGraphInternal = watt(function* (quest, recycle, desktopId, next) {
    if (!desktopId) {
      throw new Error('No desktopId provided to load-graph');
    }
    const mode = quest.goblin.getX('mode');
    const entity = quest.goblin.getX('loadedEntity');
    if (!entity) {
      return quest.cancel();
    }

    const {level, stopAtLevel, skipped} = quest.goblin.getX('loadGraphParams');

    if (level <= stopAtLevel) {
      if (mode === 'backend' || entityGraphOnly === true) {
        const api = quest.getAPI(entity.get('id'));
        api.loadGraph(
          {
            loadedBy: quest.goblin.id,
            level: level,
            stopAtLevel: stopAtLevel,
            skipped,
            desktopId,
          },
          next.parallel()
        );
      } else {
        const toCreate = [];
        const toChange = [];
        const peers = yield buildPeers(quest, entity, []);
        if (entity.get('meta.references')) {
          loadGraph(
            workitems,
            quest.goblin.id,
            toCreate,
            toChange,
            mode,
            recycle,
            plugins,
            desktopId,
            entity
          )(
            entity.get('meta.references').entries(),
            false,
            level,
            stopAtLevel,
            skipped,
            peers
          );
        }

        if (entity.get('meta.values')) {
          loadGraph(
            workitems,
            quest.goblin.id,
            toCreate,
            toChange,
            mode,
            recycle,
            plugins,
            desktopId,
            entity
          )(
            entity.get('meta.values').entries(),
            true,
            level,
            stopAtLevel,
            skipped,
            peers
          );
        }

        for (const c of toCreate) {
          quest.create(
            c.namespace || c.id,
            Object.assign(c.payload, {desktopId}),
            next.parallel()
          );
        }

        if (recycle) {
          for (const c of toChange) {
            const editorAPI = quest.getAPI(c.id);
            editorAPI.changeEntities(c.payload, next.parallel());
          }
        }
      }

      yield next.sync();
    }
    quest.evt('<workitem-loaded>');
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
        [`use-${key}`]: function* (quest, action, payload) {
          const gadgetId = quest.goblin.getState().get(`gadgets.${key}.id`);
          if (gadgetId) {
            const api = quest.getAPI(gadgetId);
            yield api[action](payload);
          }
        },
      });
    }
  }

  const changeMutex = new locks.RecursiveMutex();
  const baseQuests = {
    'load-graph': function* (quest, recycle, desktopId) {
      yield loadGraphInternal(quest, recycle, desktopId);
    },
    'after-load': function* (quest) {
      const entity = quest.goblin.getX('loadedEntity');
      if (!entity) {
        return quest.cancel();
      }
      const mode = quest.goblin.getX('mode');

      if (onLoad && (!mode || mode !== 'backend' || enable['onLoad'])) {
        yield quest.me.onLoad({entity});
      }
      yield quest.me.updateButtons();
    },
    'change-entity': function* (
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
      mustExist,
      desktopId
    ) {
      const oldEntityId = quest.goblin.getX('entityId');
      if (oldEntityId === entityId) {
        return;
      }
      yield changeMutex.lock(quest.goblin.id);
      quest.defer(() => changeMutex.unlock(quest.goblin.id));
      quest.log.dbg('CHANGE START', entityId);
      if (!level) {
        level = 1;
      }
      if (!stopAtLevel) {
        stopAtLevel = maxLevel;
      }
      if (!skipped) {
        skipped = skip;
      }
      entity = createEntity(
        quest,
        entityId,
        entity,
        parentEntity,
        rootAggregateId,
        rootAggregatePath,
        payload,
        mustExist,
        desktopId
      );

      const mode = quest.goblin.getX('mode');
      if (level === 1 && mode !== 'backend') {
        yield quest.me.subscribeToEntity({entityId: entity.get('id')});
      }

      if (lists) {
        for (const collection of lists) {
          const api = quest.getAPI(`${collection}-list@${quest.goblin.id}`);
          const options = {entityId, path: collection};
          let collectionType = common.getPropType(type, collection);

          if (!collectionType) {
            throw new Error(
              `Workitem config error: lists: ['${collection}'... is not a valid reference/value properties`
            );
          }

          options.pathType = collectionType;
          const collectionConfig = configurations[collectionType];

          if (collectionConfig.orderBy) {
            options.orderBy = collectionConfig.orderBy;
          }
          yield api.changeOptions({
            options,
          });
        }
      }

      quest.do({entity});

      yield quest.me.afterLoad();
      quest.evt('<load-graph-requested>', {
        desktopId,
        forDesktopId: desktopId,
        recycle: true,
      });

      quest.log.dbg('CHANGE END', entityId);
    },
    'set-post-remove': function (quest, postRemoveAction) {
      quest.do({postRemove: postRemoveAction});
    },
    'subscribe-to-entity': function (quest, entityId) {
      if (!entityId) {
        throw new Error(
          'Workitem error:, cannot subscrite to undefined entityId'
        );
      }

      const unsub = quest.goblin.getX('unsubChanged');
      if (unsub) {
        unsub();
      }

      quest.goblin.setX(
        'unsubChanged',
        quest.sub.local(`*::${entityId}.<entity-changed>`, function* () {
          if (onUpdate) {
            yield quest.me.update();
          }
          yield quest.me.updateButtons();
        })
      );
    },
    'unsubscribe-to-entity': function (quest) {
      const unsub = quest.goblin.getX('unsubChanged');
      if (unsub) {
        unsub();
      }
    },
    'open-wizard': common.openWizard,
    'open-entity-workitem': function* (
      quest,
      entityId,
      entity,
      navigate = true,
      desktopId
    ) {
      const desk = quest.getAPI(desktopId);
      let entityType = null;
      if (entity) {
        entityType = entity.get('meta.type');
        entityId = entity.get('id');
      } else {
        entityType = entityId.split('@')[0];
      }
      let workitemName = `${entityType}-workitem`;
      if (workitems && workitems[entityType]) {
        workitemName = workitems[entityType];
      }

      yield desk.addWorkitem({
        workitem: {
          id: quest.uuidV4(),
          name: workitemName,
          view: 'default',
          icon: 'solid/pencil',
          kind: 'tab',
          isClosable: true,
          payload: {
            entityId,
          },
        },
        navigate: navigate,
      });
    },
    'change': function (quest, path, newValue) {
      if (hinters && hinters[path]) {
        return;
      }
      quest.do();
      quest.evt('changed', {id: quest.goblin.id});
    },
    'edit': function* (quest, entity, desktopId) {
      const desk = quest.getAPI(desktopId);
      const nameId = quest.goblin.id.split('@');
      yield desk.addWorkitem({
        workitem: {
          id: quest.uuidV4(),
          name: nameId[0],
          view: 'default',
          icon: 'solid/pencil',
          kind: 'tab',
          isClosable: true,
          payload: {
            entityId: entity.get('id'),
            rootAggregateId: entity.get('meta.rootAggregateId'),
            rootAggregatePath: entity
              .get('meta.rootAggregatePath')
              .valueSeq()
              .toArray(),
          },
        },
        navigate: true,
      });
    },
    'update-buttons': function* (quest) {
      if (quest.goblin.getX('level') > 1) {
        return;
      }
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
    'showHinter': function* (quest, type, withDetail = true) {
      const hinterAPI = quest
        .getAPI(`${type}-hinter@${quest.goblin.id}`)
        .noThrow();
      yield hinterAPI.show();
      if (withDetail) {
        yield hinterAPI.showDetail();
      }
    },
    'hideHinter': function* (quest, type) {
      const hinterAPI = quest
        .getAPI(`${type}-hinter@${quest.goblin.id}`)
        .noThrow();
      yield hinterAPI.hide();
    },
    'setDetail': function* (quest, type, entityId) {
      const deskAPI = quest.getAPI(quest.getDesktop()).noThrow();
      const hinterId = `${type}-hinter@${quest.goblin.id}`;
      yield deskAPI.setDetail({
        hinterId,
      });
      const hinterAPI = quest.getAPI(hinterId).noThrow();
      yield hinterAPI.setCurrentDetailEntity({entityId});
    },
    'hide': function* (quest) {
      const deskAPI = quest.getAPI(quest.getDesktop()).noThrow();
      yield deskAPI.setDetail({
        hinterId: null,
      });
    },
    'close': function* (quest, kind, desktopId) {
      if (quest.goblin.runningCount(quest.questName) > 1) {
        return;
      }

      quest.log.info('CLOSE REQUESTED');
      const level = quest.goblin.getX('level');
      if (!desktopId) {
        desktopId = quest.goblin.getX('desktopId');
      }

      const entity = yield quest.me.getEntityState();

      //Only root has button workflow enabled
      if (level === 1) {
        // Pre-unsub, if entity change during close (ex. publishing hooks), we don't wont to trigger
        // updates on workitem, we are in closing state now
        yield quest.me.unsubscribeToEntity({entityId: entity.get('id')});

        switch (kind) {
          case 'kill':
            break;
          case 'terminate':
            //quest.evt('terminated', entity);
            break;
          case 'validate':
            {
              const cancelToken = yield quest.me.submitEntity({
                entity,
              });
              if (quest.isCanceled(cancelToken)) {
                quest.log.info('CLOSE CANCELED');
                // restore sub
                yield quest.me.subscribeToEntity({entityId: entity.get('id')});
                return cancelToken;
              }
              //quest.evt('validated', entity);
            }
            break;
          case 'publish':
            {
              const cancelToken = yield quest.me.publishEntity({
                entity,
              });
              if (quest.isCanceled(cancelToken)) {
                quest.log.info('CLOSE AND PUBLISH CANCELED');
                // restore sub
                yield quest.me.subscribeToEntity({entityId: entity.get('id')});
                return cancelToken;
              }
              //quest.evt('published', entity);
            }
            break;
          case 'archive':
            {
              const cancelToken = yield quest.me.archiveEntity({
                entity,
              });
              if (quest.isCanceled(cancelToken)) {
                quest.log.info('CLOSE AND ARCHIVE CANCELED');
                // restore sub
                yield quest.me.subscribeToEntity({entityId: entity.get('id')});
                return cancelToken;
              }
              //quest.evt('archived', entity);
            }
            break;
          case 'trash':
            {
              const cancelToken = yield quest.me.trashEntity({
                entity,
              });
              if (quest.isCanceled(cancelToken)) {
                quest.log.info('CLOSE AND TRASH CANCELED');
                // restore sub
                yield quest.me.subscribeToEntity({entityId: entity.get('id')});
                return cancelToken;
              }
              //quest.evt('trashed', entity);
            }
            break;
        }
      }

      if (kind !== 'kill') {
        quest.evt(`${desktopId}.<remove-workitem-requested>`, {
          workitemId: quest.goblin.id,
          close: false,
          navToLastWorkitem: true,
        });
      }

      const postRemove = quest.goblin.getState().get('postRemove');
      if (postRemove) {
        postRemove();
      }
    },
    'add-state-monitor': function* (quest, key) {
      const desktopId = quest.goblin.getX('desktopId');
      const deskAPI = quest.getAPI(desktopId).noThrow();
      yield deskAPI.addStateMonitor({key, doPush: true});
    },
  };

  common.registerQuests(goblinName, baseQuests);

  const entityHelperQuests = {
    'get-entity-state': common.getEntityState,
    'get-entity': common.getEntityQuest,
    'get-entities': common.getEntitiesQuest,
    'load-entity': common.loadEntityQuest,
  };

  common.registerQuests(goblinName, entityHelperQuests);

  const entityFlowQuests = {
    'trash-entity': function* (quest) {
      let cancelToken = null;
      if (onTrash) {
        cancelToken = yield quest.me.onTrash({});
      }
      if (quest.isCanceled(cancelToken)) {
        return cancelToken;
      }
      const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
      yield entityAPI.trashEntity();
      yield quest.me.updateButtons();
      return null;
    },
    'archive-entity': function* (quest) {
      const mode = quest.goblin.getX('mode');
      let cancelToken = null;
      if (onArchive && (!mode || enable['onArchive'])) {
        cancelToken = yield quest.me.onArchive({});
      }
      if (quest.isCanceled(cancelToken)) {
        return cancelToken;
      }
      const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
      yield entityAPI.archiveEntity();
      yield quest.me.updateButtons();
      return null;
    },
    'publish-entity': function* (quest) {
      const mode = quest.goblin.getX('mode');
      let cancelToken = null;
      if (onPublish && (!mode || enable['onPublish'])) {
        cancelToken = yield quest.me.onPublish({});
      }
      if (quest.isCanceled(cancelToken)) {
        return cancelToken;
      }
      const entityAPI = quest.getAPI(quest.goblin.getX('entityId'));
      yield entityAPI.publishEntity();
      yield quest.me.updateButtons();
      return null;
    },
    'submit-entity': function* (quest) {
      const mode = quest.goblin.getX('mode');
      let cancelToken = null;
      if (onSubmit && (!mode || enable['onPublish'])) {
        cancelToken = yield quest.me.onSubmit({});
      }
      if (quest.isCanceled(cancelToken)) {
        return cancelToken;
      }
      yield quest.me.updateButtons();
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

  if (onTrash) {
    common.registerQuests(goblinName, {'on-trash': onTrash});
  }

  if (buttons) {
    common.registerQuests(goblinName, {buttons: buttons});
  }

  if (onUpdate) {
    common.registerQuests(goblinName, {update: onUpdate});
  }

  Goblin.registerQuest(goblinName, 'drill-down', function (
    quest,
    entityIds,
    desktopId,
    view
  ) {
    quest.evt('<drill-down-requested>', {
      entityIds,
      view,
      desktopId,
    });
  });

  Goblin.registerQuest(goblinName, 'delete', function (quest) {
    const unsub = quest.goblin.getX('unsubChanged');
    if (unsub) {
      unsub();
    }
    quest.evt('<unsubscribe-requested>');
  });

  return Goblin.configure(goblinName, {}, logicHandlers);
};
