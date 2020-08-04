'use strict';
//T:2019-02-27

const path = require('path');
const _ = require('lodash');

const goblinName = path.basename(module.parent.filename, '.js');
const {
  configurations,
  indexerMappingsByType,
} = require('goblin-workshop').buildEntity;
const Goblin = require('xcraft-core-goblin');
const {locks} = require('xcraft-core-utils');

// Define initial logic values
const logicState = {
  count: 0,
  list: {},
  options: {contentIndex: {}},
  highlights: [],
};

// Define logic handlers according rc.json
const logicHandlers = require('./logic-handlers.js');

class List {
  static resolveMode(quest, options) {
    if (!options) {
      quest.goblin.setX('mode', 'index');
    } else {
      if (options.contentIndex) {
        quest.goblin.setX('mode', 'index');
      } else if (options.entityId && options.path) {
        if (options.orderBy && options.pathType) {
          quest.goblin.setX('mode', 'entity-ordered');
        } else {
          quest.goblin.setX('mode', 'entity');
        }
      } else if (options.query) {
        quest.goblin.setX('mode', 'query');
      } else if (options.field) {
        quest.goblin.setX('mode', 'search');
      } else if (options.empty) {
        quest.goblin.setX('mode', 'empty');
      } else {
        throw new Error('List create, bad options provided');
      }
    }
  }

  static _getStorage(quest) {
    return quest.getStorage('rethink');
  }

  static _init(quest, options) {
    const r = List._getStorage(quest);
    const table = quest.goblin.getX('table');
    const mode = quest.goblin.getX('mode');
    if (!options) {
      options = quest.goblin.getState().get('options').toJS();
    }

    return {r, table, mode, options};
  }

  static *_ids(quest, range) {
    const {r, table, mode, options} = this._init(quest);
    switch (mode) {
      case 'empty': {
        return [];
      }
      case 'search': {
        const value = quest.goblin.getX('value');

        return yield* List.executeSearch(
          quest,
          value,
          options.sort,
          options.filters,
          range
        );
      }
      case 'index': {
        return yield r.getIds({
          table,
          contentIndex: options.contentIndex,
          range,
        });
      }
      case 'entity': {
        const collection = yield r.getIn({
          table,
          documentId: options.entityId,
          path: [options.path],
        });
        return collection.slice(range.start, range.start + range.length);
      }
      case 'entity-ordered': {
        return yield r.getOrderedCollectionIds({
          table,
          documentId: options.entityId,
          collectionTable: options.pathType,
          collection: options.path,
          orderBy: options.orderBy,
          range,
        });
      }
      case 'query': {
        return yield r.queryIds({
          query: options.query.toString(),
          args: options.queryArgs || [],
        });
      }
    }
  }

  static *count(quest, initOptions) {
    const {r, table, mode, options} = this._init(quest, initOptions);
    switch (mode) {
      case 'empty': {
        return 0;
      }
      case 'search': {
        const value = quest.goblin.getX('value');
        //TODO: execute a real count aggregation
        yield* List.executeSearch(quest, value, options.sort, options.filters);
        return quest.goblin.getX('count');
      }
      case 'index': {
        const count = yield r.count({
          table,
          contentIndex: options.contentIndex,
        });
        quest.goblin.setX('count', count);
        return count;
      }
      case 'entity': {
        const collection = yield r.getIn({
          table,
          documentId: options.entityId,
          path: [options.path],
        });
        const count = collection.length;
        quest.goblin.setX('count', count);
        return count;
      }
      case 'entity-ordered': {
        const count = yield r.getOrderedCollectionCount({
          table,
          documentId: options.entityId,
          collectionTable: options.pathType,
          collection: options.path,
          orderBy: options.orderBy,
        });
        quest.goblin.setX('count', count);
        return count;
      }
      case 'query': {
        const count = yield r.queryCount({
          query: options.query,
          args: options.queryArgs || [],
        });
        quest.goblin.setX('count', count);
        return count;
      }
    }
  }

  /**
   * Fetch the document IDs accordingly a range.
   *
   * @param {*} quest - Quest context
   * @param {Object} range - Range in the list
   * @returns {Object} the IDs
   */
  static *refresh(quest, range) {
    /* The result is an array, we must correct the keys according to the
     * offset (first index).
     */

    const ids = Object.values(
      _.mapKeys(
        Object.assign(
          {},
          yield* this._ids(quest, {
            start: range[0],
            length: range[1] - range[0] + 1,
          })
        ),
        (_, k) => Number(k) + range[0]
      )
    );
    quest.goblin.setX('ids', ids);
    return ids;
  }

  static *changes(quest, dispose) {
    const {r, table, options} = this._init(quest);
    const goblinId = quest.goblin.id;
    const rethinkId = List._getStorage(quest).id;
    yield r.stopOnChanges({
      goblinId,
    });

    if (dispose) {
      return;
    }

    let changeSub = quest.goblin.getX('changeSub');
    if (!changeSub) {
      changeSub = quest.sub(
        `*::${rethinkId}.${goblinId}-cursor.changed`,
        function* (err, {msg, resp}) {
          yield resp.cmd(`${goblinName}.handle-changes`, {
            id: goblinId,
            change: msg.data,
          });
        }
      );
      quest.goblin.setX('changeSub', changeSub);
    }

    yield r.startQuestOnChanges({
      table,
      goblinId,
      options: options,
    });
  }

  static *generateFacets(quest, type, columns) {
    const elastic = quest.getStorage('elastic');

    const getDisplayName = (path) => {
      const hit = columns.find((c) => c.path === path.replace(/\//g, '.'));
      if (hit) {
        return hit.text;
      } else {
        return path;
      }
    };

    let mapping = indexerMappingsByType.find((mapping) => mapping.type === type)
      .properties;
    if (mapping) {
      mapping = Object.keys(mapping).filter((k) => k !== 'meta/status');
    } else {
      mapping = [];
    }

    const facets = [
      {name: 'meta/status', field: 'meta/status'},
      ...mapping.map((k) => {
        return {name: k, field: k};
      }),
    ];

    const filters = [
      {
        name: 'meta/status',
        value: ['draft', 'trashed', 'archived'],
        displayName: getDisplayName('meta/status'),
      },
      ...mapping.map((k) => {
        return {
          name: k,
          value: [],
          displayName: getDisplayName(k),
        };
      }),
    ];

    const res = yield elastic.generateFacets({
      type,
      facets,
    });

    const buckets = facets.reduce((buckets, f) => {
      buckets[f.name] = res[f.name].buckets;
      return buckets;
    }, {});

    return {
      buckets,
      filters,
    };
  }

  static *executeSearch(quest, value, sort, filters, range) {
    const elastic = quest.getStorage('elastic');

    quest.goblin.setX('value', value);
    quest.goblin.setX('highlights', []);

    const options = quest.goblin.getState().get('options').toJS();

    let from;
    let size = 10;

    if (!range) {
      range = quest.goblin.getX('range');

      from = range ? range[0] : undefined;
      size = range ? range[1] - range[0] + 1 : undefined;
    } else {
      from = range.start;
      size = range.length;
    }

    let type = options.type;
    const subTypes = options.subTypes;
    if (subTypes) {
      subTypes.forEach((subType) => {
        type = `${type},${subType}`;
      });
    }

    let values = [];
    let afterSearch = null;
    if (from + size > 9999) {
      afterSearch = [quest.goblin.getX('afterSearch')];
    }

    let results = yield elastic.search({
      type,
      value,
      sort,
      filters: filters ? Object.values(filters) : null,
      from: afterSearch ? -1 : from,
      size,
      afterSearch,
      mustExist: true,
      source: false,
    });

    values = results.hits.hits.map((h) => h._id);

    const extractHighlightInfos = (hit) => {
      if (!hit.highlight) {
        return null;
      }
      const id = hit._id;
      const phonetic =
        hit.highlight.searchPhonetic &&
        hit.highlight.searchPhonetic[0].includes('<em>')
          ? hit.highlight.searchPhonetic[0].replace(/<\/?em>/g, '`')
          : null;
      const auto =
        hit.highlight.searchAutocomplete &&
        hit.highlight.searchAutocomplete[0].includes('<em>')
          ? hit.highlight.searchAutocomplete[0].replace(/<\/?em>/g, '`')
          : null;
      const score = hit._score / 10; // TODO: Use best value!

      return {id, phonetic, auto, score};
    };

    const highlights = results.hits.hits.reduce((highlights, hit) => {
      const res = extractHighlightInfos(hit);
      if (res) {
        highlights[res.id] = res;
      }
      return highlights;
    }, {});

    if (results.hits.hits.length > 0) {
      const sortField = options.sort.key.replace('.keyword', '');
      quest.goblin.setX(
        'afterSearch',
        results.hits.hits[results.hits.hits.length - 1]._source[sortField]
      );
    }

    quest.goblin.setX('count', results.hits.total);
    quest.goblin.setX('ids', values);
    quest.dispatch('set-highlights', {highlights});

    return values;
  }
}

//contentIndex => options
//  classic on index case:
//  {contentIndex: {name:'',value:''}}
//  collection case:
//  {entityId: type@guid, path: '.collection'}
//  search case:
//  {
//   field: 'id',
//   fields: ['info'],
//   type: 'document',
//   subTypes: [''],
//   subJoins: [''],
//   sort: {dir: 'asc', key: 'value.keyword'},
// }
// Register quest's according rc.json
Goblin.registerQuest(goblinName, 'create', function* (
  quest,
  desktopId,
  clientSessionId,
  table,
  status,
  options,
  columns
) {
  /* This mutex prevent races when indices are fetching and the content-index
   * is changing. It must not be possible to run a fetch while a
   * change-content-index is running, otherwise the indices are lost.
   */
  const mutex = new locks.Mutex();
  quest.goblin.setX('mutex', mutex);
  quest.goblin.setX('desktopId', desktopId);
  quest.goblin.setX('table', table);

  List.resolveMode(quest, options);

  const id = quest.goblin.id;
  const mode = quest.goblin.getX('mode');
  if (mode === 'empty') {
    return id;
  }

  if (mode === 'search') {
    if (!columns) {
      console.log(`Loading list view option for ${table}...`);
      columns = [];
      if (configurations[table].defaultSearchColumn) {
        columns.push(configurations[table].defaultSearchColumn);
      } else {
        columns.push({text: 'Info', path: 'meta.summaries.info'});
      }
      columns.push({text: 'Statut fiche', path: 'meta.status'});

      const defaultHandledProps = ['isReady', 'status', 'hasErrors'];
      const correspondingTexts = {
        isReady: 'Prêt ?',
        status: 'Statut métier',
        hasErrors: 'Erreurs ?',
      };
      if (configurations[table].properties) {
        for (const prop of Object.keys(configurations[table].properties)) {
          if (defaultHandledProps.indexOf(prop) !== -1) {
            columns.push({text: correspondingTexts[prop], path: prop});
          }
        }
      }
      if (configurations[table].computer && configurations[table].sums.base) {
        columns.push({text: 'Total', path: 'sums.base'});
      }

      if (configurations[table].searchCustomColumns) {
        columns = columns.concat(configurations[table].searchCustomColumns);
      }
      const viewId = `view@${table}`;
      const viewAPI = yield quest.create(`view@${table}`, {
        id: viewId,
        desktopId,
        name: `${table}-view`,
      });
      const metaStatus = yield quest.warehouse.get({
        path: `${viewId}.meta.status`,
      });
      // When code is changing, clear the batabase, by exemple http://lab0.epsitec.ch:9900/#dataexplorer
      // with r.db("epsitec").table("view").delete()
      if (metaStatus === 'draft') {
        yield viewAPI.mergeDefaultColumns({columns});
        yield viewAPI.publishEntity();
      }
      yield viewAPI.loadGraph({
        desktopId,
        loadedBy: quest.goblin.id,
        level: 1,
        stopAtLevel: 1,
        skipped: [],
      });

      let userSettings;
      if (options.sort && clientSessionId) {
        userSettings = yield quest.warehouse.get({path: clientSessionId});
        const viewSetting = userSettings.get(`views.view@${table}`);
        if (viewSetting) {
          const columnId = viewSetting.get('sorting.columnId');
          const column = yield quest.warehouse.get({path: columnId});
          if (column) {
            let path = column.get('path').replace(/\./g, '/');
            //HACK: mapped to info index
            if (
              path === 'meta/summaries/info' ||
              path === 'meta/summaries/description'
            ) {
              path = 'info.keyword';
            }
            options.sort = {
              key: path,
              dir: viewSetting.get('sorting.direction'),
            };
          }
        }
      }
    }
  }

  quest.do();
  const count = yield* List.count(quest, options);
  quest.dispatch('set-count', {count, initial: true});
  yield quest.me.initList();

  if (mode === 'search') {
    const facets = yield* List.generateFacets(quest, table, columns);
    quest.dispatch('set-facets', {facets});
  }

  return id;
});

Goblin.registerQuest(goblinName, 'clear', function* (quest) {
  quest.dispatch('set-count', {count: 0});
  yield quest.me.initList();
});

Goblin.registerQuest(goblinName, 'change-options', function* (quest, options) {
  List.resolveMode(quest, options);

  const count = yield* List.count(quest, options);

  quest.do({
    count,
    options,
  });

  yield quest.me.initList();
  yield quest.me.fetch();
});

Goblin.registerQuest(goblinName, 'get-list-ids', function (quest) {
  return quest.goblin.getX('ids');
});

Goblin.registerQuest(goblinName, 'toggle-facet-filter', function* (
  quest,
  facet,
  filterName
) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.fetch();
});

Goblin.registerQuest(goblinName, 'set-all-facets', function* (
  quest,
  filterName
) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.fetch();
});

Goblin.registerQuest(goblinName, 'clear-all-facets', function* (
  quest,
  filterName
) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.fetch();
});

Goblin.registerQuest(goblinName, 'toggle-all-facets', function* (
  quest,
  filterName
) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.fetch();
});

Goblin.registerQuest(goblinName, 'customize-visualization', function* (
  quest,
  value,
  filter,
  sort
) {
  quest.goblin.setX('value', value || '');
  quest.do();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.fetch();
});

Goblin.registerQuest(goblinName, 'set-filter-value', function* (
  quest,
  filterValue
) {
  try {
    quest.goblin.setX('value', filterValue);
    const count = yield* List.count(quest);
    quest.dispatch('set-count', {count});
    yield quest.me.initList();
    yield quest.me.fetch();
  } catch {
    console.warn('FIXME: list disposed when UI set-filter-value');
  }
});

Goblin.registerQuest(goblinName, 'set-sort', function* (quest, key, dir) {
  quest.do({key, dir});
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.fetch();
});

Goblin.registerQuest(goblinName, 'change-content-index', function* (
  quest,
  name,
  value
) {
  const contentIndex = {name, value};
  quest.evt('content-index-changed', contentIndex);

  const count = yield* List.count(quest, {contentIndex});
  quest.do({count});
  yield quest.me.initList();
  yield quest.me.fetch();
});

Goblin.registerQuest(goblinName, 'handle-changes', function* (quest, change) {
  const mode = quest.goblin.getX('mode');
  switch (mode) {
    case 'search':
      break;
    case 'query':
    case 'index': {
      switch (change.type) {
        case 'add': {
          quest.dispatch('add');
          yield quest.me.fetch();
          break;
        }

        case 'change': {
          quest.do();
          yield quest.me.fetch();
          break;
        }

        case 'remove': {
          quest.dispatch('remove');
          yield quest.me.fetch();
          break;
        }
      }
      break;
    }
    case 'entity-ordered':
    case 'entity': {
      if (change.type === 'change') {
        const path = quest.goblin.getState().get('options.path');

        if (change.new_val[path].length > change.old_val[path].length) {
          quest.dispatch('add');
        }
        if (change.new_val[path].length < change.old_val[path].length) {
          quest.dispatch('remove');
        }
        if (change.new_val[path].length === change.old_val[path].length) {
          quest.do();
        }

        yield quest.me.fetch();
      }

      break;
    }
  }
});

const fetchLock = locks.getMutex;
Goblin.registerQuest(goblinName, 'fetch', function* (quest, range) {
  const locky = quest.goblin.id;
  yield fetchLock.lock(locky);
  quest.defer(() => fetchLock.unlock(locky));

  if (range) {
    quest.goblin.setX('range', range);
  } else {
    range = quest.goblin.getX('range', []);
  }

  /* Ensure at least one item before and after the requested range.
   * It handles the case where the whole list is shorter that the view and
   * a new item is just added (and notified by the changes event).
   */
  if (range.length > 0) {
    if (range[0] > 0) {
      range[0]--;
    }
    range[1]++;
  } else {
    range = [0, 1];
  }

  const ids = yield* List.refresh(quest, range);
  const count = quest.goblin.getX('count');
  if (ids.length > 0) {
    quest.do({count, ids, offset: range[0]});
  }
});

Goblin.registerQuest(goblinName, 'init-list', function* (quest) {
  yield* List.changes(quest);
});

Goblin.registerQuest(goblinName, 'delete', function* (quest) {
  //dispose list changes
  yield* List.changes(quest, true);
  const changeSub = quest.goblin.getX('changeSub');
  if (changeSub) {
    changeSub(); //unsub
  }
  quest.evt('disposed');
});

// Create a Goblin with initial state and handlers
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
