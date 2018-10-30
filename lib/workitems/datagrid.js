const Goblin = require('xcraft-core-goblin');
const common = require('./common.js');

module.exports = config => {
  const {
    type,
    name,
    kind,
    title,
    columns,
    dialog,
    pageSize,
    initialStatuses,
    initialState,
    logicHandlers,
    listFilter,
    quests,
    afterCreate,
  } = config;

  let goblinName = `${type}-${kind}`;

  if (name) {
    goblinName = name;
  }

  const _logicHandlers = {
    create: (state, action) => {
      const config = {
        id: action.get('id'),
        type,
        goblinName,
        title: title,
        dialog: dialog || {
          width: '1000px',
        },
        columns,
        columnsSize: columns ? columns.length : 0,
        ...initialState,
      };
      return state.set('', config);
    },
    change: (state, action) => {
      return state.set(action.get('path'), action.get('newValue'));
    },
    ...logicHandlers,
  };

  Goblin.registerQuest(goblinName, 'create', function*(quest, desktopId) {
    quest.goblin.setX('desktopId', desktopId);

    const listAPI = yield quest.createPlugin('list', {
      desktopId,
      table: type,
      pageSize: pageSize || 50,
      filter: listFilter,
      status: initialStatuses || ['draft'],
      orderBy: 'id',
    });

    const ids = yield listAPI.getListIds();

    quest.defer(() =>
      ids.forEach(id => {
        quest.me.loadEntity({entityId: id});
      })
    );

    if (afterCreate) {
      yield quest.me.afterCreate();
    }

    quest.do();
  });

  Goblin.registerQuest(goblinName, 'close', function*(
    quest,
    kind,
    desktopId,
    contextId
  ) {
    quest.log.info('CLOSE REQUESTED');
    if (!desktopId) {
      desktopId = quest.goblin.getX('desktopId');
    }
    if (!contextId) {
      contextId = quest.goblin.getX('contextId');
    }

    const desk = quest.getAPI(desktopId);

    switch (kind) {
      case 'dialog': {
        yield desk.removeDialog({dialogId: quest.goblin.id});
        break;
      }

      default: {
        const nameId = quest.goblin.id.split('@');
        yield desk.removeWorkitem({
          workitem: {
            id: quest.goblin.id.replace(nameId[0] + '@', ''),
            name: nameId[0],
            kind: kind || 'tab',
            contextId: contextId,
          },
          close: false,
        });
        break;
      }
    }

    quest.release(quest.goblin.id);
  });

  if (quests) {
    common.registerQuests(goblinName, quests);
  }

  Goblin.registerQuest(goblinName, 'change', function(quest) {
    quest.do();
    quest.evt('changed', {id: quest.goblin.id});
  });

  if (afterCreate) {
    Goblin.registerQuest(goblinName, 'after-create', afterCreate);
  }

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, _logicHandlers);
};
