const Goblin = require('xcraft-core-goblin');
const common = require('./common.js');
const {
  buildFilterReql,
  buildOrderByReql,
} = require('goblin-rethink/helpers.js');

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
    listOrderBy,
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
        name: goblinName,
        title: title,
        dialog: dialog || {
          width: '1000px',
        },
        columns,
        columnsSize: columns ? columns.length : 0,
        sort: {
          key: listOrderBy || '',
          dir: 'asc',
        },
        filters: listFilter || null,
        ...initialState,
      };
      return state.set('', config);
    },
    change: (state, action) => {
      return state.set(action.get('path'), action.get('newValue'));
    },
    ...logicHandlers,
  };

  Goblin.registerQuest(goblinName, 'create', function*(quest, desktopId, next) {
    quest.goblin.setX('desktopId', desktopId);

    // No index is still used (bug in rethink goblin)
    /*if (listOrderBy && listOrderBy !== '') {
      const r = quest.getStorage('rethink');

      const sortKeyArr = listOrderBy.split('.');
      const sortKeyIndex = sortKeyArr[sortKeyArr.length - 1];

      yield r.ensureSecondaryIndex(
        {
          table: type,
          name: sortKeyIndex,
          path: listOrderBy,
        },
        next
      );
    }*/

    const listAPI = yield quest.createPlugin('list', {
      desktopId,
      table: type,
      pageSize: pageSize || 50,
      filter: listFilter
        ? buildFilterReql(listFilter, value => '(?i).*' + value + '.*')
        : null,
      status: initialStatuses || ['draft'],
      orderBy:
        listOrderBy && listOrderBy !== ''
          ? buildOrderByReql(listOrderBy, 'asc')
          : 'id',
    });
    quest.goblin.setX('listId', listAPI.id);

    quest.defer(() => quest.me.loadMessages());

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

    quest.defer(() => quest.me.changeListVisualization(quest, next));
  });

  Goblin.registerQuest(goblinName, 'filter', function*(
    quest,
    field,
    value,
    next
  ) {
    yield quest.me.change(
      {
        path: `filters.${field}`,
        newValue: value,
      },
      next
    );

    quest.defer(() => quest.me.changeListVisualization(quest, next));
  });

  Goblin.registerQuest(goblinName, 'change-list-visualization', function*(
    quest,
    next
  ) {
    const listId = quest.goblin.getX('listId');
    const listAPI = quest.getAPI(listId);
    const r = quest.getStorage('rethink');

    const filters = quest.goblin.getState().get('filters');
    const sort = quest.goblin.getState().get('sort');
    const sortKey = sort.get('key');

    // No index is still used (bug in rethink goblin)
    /*if (sortKey && sortKey !== '') {
      const sortKeyArr = sortKey.split('.');
      const sortKeyIndex = sortKeyArr[sortKeyArr.length - 1];

      yield r.ensureSecondaryIndex(
        {
          table: type,
          name: sortKeyIndex,
          path: sortKey,
        },
        next
      );
    }*/

    yield listAPI.changeVisualization(
      {
        orderBy:
          sortKey && sortKey !== ''
            ? buildOrderByReql(sortKey, sort.get('dir'))
            : null,
        filter: filters
          ? buildFilterReql(filters.toJS(), value => '(?i).*' + value + '.*')
          : null,
      },
      next
    );

    quest.defer(() => quest.me.loadMessages());
  });

  Goblin.registerQuest(goblinName, 'load-messages', function*(quest, next) {
    const listId = quest.goblin.getX('listId');
    const listAPI = quest.getAPI(listId);

    const ids = yield listAPI.getListIds(next);

    quest.defer(() =>
      ids.forEach(id => {
        quest.me.loadEntity({entityId: id});
      })
    );
  });

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, _logicHandlers);
};
