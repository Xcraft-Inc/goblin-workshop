const Goblin = require('xcraft-core-goblin');
const common = require('./common.js');

module.exports = (config) => {
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
    createMissingDrillDownEntities,
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
    apply: (state, action) => {
      return state.mergeDeep(action.get('path', ''), action.get('patch'));
    },
    ...logicHandlers,
  };

  Goblin.registerQuest(goblinName, 'sort-key', function (quest, columnName) {
    let key = '';
    let searchColumns = columns;
    if (columnName) {
      const state = quest.goblin.getState().get('columns');
      let stateColumns = state ? state.toJS() : null;
      if (stateColumns) {
        searchColumns = stateColumns;
      }

      const item = searchColumns.find((ele) => {
        return ele.field === columnName;
      });
      const sortKey = item ? item.sortKey : '';
      if (sortKey) {
        key = sortKey;
      } else {
        key = columnName;
      }
    }

    return key;
  });

  Goblin.registerQuest(goblinName, 'create', function* (
    quest,
    desktopId,
    next
  ) {
    quest.goblin.setX('desktopId', desktopId);

    let sortKey = yield quest.me.sortKey({columnName: listOrderBy});
    const listApi = yield quest.createPlugin('list', {
      desktopId,
      table: type,
      status: listStatus || ['draft'],
      type: listType || 'simple',
      options: {
        ...hinter,
        sort: {
          key: sortKey,
          dir: listOrderDir || 'asc',
        },
      },
    });
    quest.goblin.setX('listId', listApi.id);

    quest.do();

    if (afterCreate) {
      yield quest.me.afterCreate();
    }
  });

  Goblin.registerQuest(goblinName, 'close', function (quest, kind, desktopId) {
    quest.log.info('CLOSE REQUESTED');
    if (!desktopId) {
      desktopId = quest.goblin.getX('desktopId');
    }

    quest.evt(`${desktopId}.<remove-workitem-requested>`, {
      workitemId: quest.gobblin.id,
      close: false,
    });

    quest.release(quest.goblin.id);
  });

  if (quests) {
    Object.keys(quests).forEach((q) =>
      Goblin.registerQuest(goblinName, q, quests[q])
    );
  }

  Goblin.registerQuest(goblinName, 'change', function (quest) {
    quest.do();
    quest.evt('changed', {id: quest.goblin.id});
  });

  Goblin.registerQuest(goblinName, 'apply', function (quest) {
    quest.do();
    quest.evt('changed', {id: quest.goblin.id});
  });

  if (afterCreate) {
    Goblin.registerQuest(goblinName, 'after-create', afterCreate);
  }

  Goblin.registerQuest(goblinName, 'drill-down', function (
    quest,
    entityIds,
    view
  ) {
    quest.evt('<drill-down-requested>', {
      entityIds,
      createMissing: createMissingDrillDownEntities,
      desktopId: quest.goblin.getX('desktopId'),
      view,
    });
  });

  Goblin.registerQuest(goblinName, 'toggle-sort', function* (
    quest,
    field,
    next
  ) {
    if (!field) {
      quest.log.warn('Cannot toggle sort on empty field');
      return;
    }

    const sort = quest.goblin.getState().get('sort');

    const lastField = sort.get('key');
    const dir = sort.get('dir');
    let newDir = dir === 'asc' ? 'desc' : 'asc';

    let key = yield quest.me.sortKey({columnName: field});
    if (key !== lastField) {
      newDir = 'asc'; // but if we sort by a new field, then by default an asc order is used

      yield quest.me.change(
        {
          path: `sort.key`,
          newValue: key,
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

  Goblin.registerQuest(goblinName, 'reset-list-visualization', function* (
    quest,
    filter,
    orderBy,
    orderDir,
    next
  ) {
    let key = '';
    if (orderBy) {
      key = yield quest.me.sortKey({columnName: orderBy});
    } else if (listOrderBy) {
      key = yield quest.me.sortKey({columnName: listOrderBy});
    }

    yield quest.me.change(
      {
        path: `sort.key`,
        newValue: key,
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

  Goblin.registerQuest(goblinName, 'change-data', function* (quest) {
    const sortValue = quest.goblin.getState().get('sort').toJS();
    const searchValue = quest.goblin.getState().get('searchValue');

    const listId = quest.goblin.getX('listId');
    const listApi = quest.getAPI(listId);
    yield listApi.customizeVisualization({
      value: searchValue,
      sort: sortValue,
    });
  });

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'delete', function (quest) {});

  return Goblin.configure(goblinName, {}, _logicHandlers);
};
