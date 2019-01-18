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
    listStatus,
    listFilter,
    listOrderBy,
    listOrderDir,
    listType,
    initialState,
    logicHandlers,
    quests,
    afterCreate,
    hinter,
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
        name: goblinName,
        title: title,
        dialog: dialog || {
          width: '1000px',
        },
        columns,
        columnsNo: columns ? columns.length : 0,
        sort: {
          key: listOrderBy || '',
          dir: listOrderDir || 'asc',
        },
        filters: listFilter || {},
        hinter,
        ...initialState,
      };
      return state.set('', config);
    },
    change: (state, action) => {
      const path = action.get('path');
      return state.set(path, action.get('newValue'));
    },
    ...logicHandlers,
  };

  Goblin.registerQuest(goblinName, 'create', function*(quest, desktopId, next) {
    quest.goblin.setX('desktopId', desktopId);

    const datagridAPI = yield quest.createPlugin('list', {
      desktopId,
      table: type,
      status: listStatus || ['draft'],
      type: listType || 'simple',
      hinter,
      sort: {
        key: listOrderBy || '',
        dir: listOrderDir || 'asc',
      },
    });
    quest.goblin.setX('datagridId', datagridAPI.id);

    quest.do();

    if (afterCreate) {
      yield quest.me.afterCreate();
    }
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
    Object.keys(quests).forEach(q =>
      Goblin.registerQuest(goblinName, q, quests[q])
    );
  }

  Goblin.registerQuest(goblinName, 'change', function(quest) {
    quest.do();
    quest.evt('changed', {id: quest.goblin.id});
  });

  if (afterCreate) {
    Goblin.registerQuest(goblinName, 'after-create', afterCreate);
  }

  Goblin.registerQuest(goblinName, 'toggle-sort', function*(
    quest,
    field,
    next
  ) {
    const sort = quest.goblin.getState().get('sort');

    const lastField = sort.get('key');
    const dir = sort.get('dir');
    let newDir = dir === 'asc' ? 'desc' : 'asc';

    if (field !== lastField) {
      newDir = 'asc'; // but if we sort by a new field, then by default an asc order is used

      yield quest.me.change(
        {
          path: `sort.key`,
          newValue: field,
        },
        next
      );
    }

    yield quest.me.change(
      {
        path: `sort.dir`,
        newValue: newDir,
      },
      next
    );

    yield quest.me.changeData();
  });

  Goblin.registerQuest(goblinName, 'reset-list-visualization', function*(
    quest,
    filter,
    orderBy,
    orderDir,
    next
  ) {
    yield quest.me.change(
      {
        path: `sort.key`,
        newValue: orderBy || listOrderBy || '',
      },
      next
    );

    yield quest.me.change(
      {
        path: `sort.dir`,
        newValue: orderDir || listOrderDir || 'asc',
      },
      next
    );

    yield quest.me.changeData();
  });

  Goblin.registerQuest(goblinName, 'change-data', function*(quest) {
    const sortValue = quest.goblin.getState().get('sort');
    let key = 'value.keyword';
    const sortKey = sortValue.get('key');
    if (sortKey !== 'nabuId') {
      key = `${sortKey}-value.keyword`;
    }
    const searchValue = quest.goblin.getState().get('searchValue');

    const datagridId = quest.goblin.getX('datagridId');
    const datagridAPI = quest.getAPI(datagridId);
    yield datagridAPI.customizeVisualization({
      filter: searchValue,
      sort: {
        key,
        dir: sortValue.get('dir'),
      },
    });
  });

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, _logicHandlers);
};
