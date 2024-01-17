'use strict';
//T:2019-02-27

const path = require('path');
const _ = require('lodash');
const T = require('goblin-nabu');
const goblinName = path.basename(module.parent.filename, '.js');
const {
  configurations,
  indexerMappingsByType,
} = require('goblin-workshop').buildEntity;
const Goblin = require('xcraft-core-goblin');
const {locks, EventDebouncer} = require('xcraft-core-utils');
const MarkdownBuilder = require('goblin-workshop/lib/markdown-builder.js');

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
        return yield* List.executeSearch(
          quest,
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
        //TODO: execute a real count aggregation
        yield* List.executeSearch(quest, options.sort, options.filters);
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
    quest.goblin.setX('range', range);
    return ids;
  }

  static *changes(quest, dispose) {
    const {r, mode, table, options} = this._init(quest);
    if (mode === 'search') {
      return;
    }
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

  static *countIndex(quest, type) {
    const elastic = quest.getStorage('elastic');
    return yield elastic.count({
      type,
    });
  }

  static *updateFacets(quest, type) {
    const elastic = quest.getStorage('elastic');

    const properties = indexerMappingsByType.find(
      (mapping) => mapping.type === type
    ).properties;

    let mapping = [];
    if (properties) {
      mapping = Object.keys(properties).filter((k) => k !== 'meta/status');
    }

    const facets = [
      {name: 'meta/status', field: 'meta/status', type: 'keyword'},
      ...mapping.map((k) => {
        return {name: k, field: k, type: properties[k].type};
      }),
    ];

    const res = yield elastic.generateFacets({
      type,
      facets,
    });

    const buckets = facets.reduce((buckets, f) => {
      switch (f.type) {
        default:
        case 'keyword':
          buckets[f.name] = res[f.name].buckets;
          break;
        case 'date':
          buckets[f.name] = {};
          buckets[f.name].agg = res[f.name].buckets;
          buckets[f.name].min = undefined;
          if (res[`${f.name}_min`] && res[`${f.name}_min`].value_as_string) {
            buckets[f.name].min = res[`${f.name}_min`].value_as_string.split(
              'T'
            )[0];
          }
          buckets[f.name].max = undefined;
          if (res[`${f.name}_max`] && res[`${f.name}_max`].value_as_string) {
            buckets[f.name].max = res[`${f.name}_max`].value_as_string.split(
              'T'
            )[0];
          }

          break;
      }

      return buckets;
    }, {});

    return {
      buckets,
    };
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

    const properties = indexerMappingsByType.find(
      (mapping) => mapping.type === type
    ).properties;

    let mapping = [];
    if (properties) {
      mapping = Object.keys(properties).filter((k) => k !== 'meta/status');
    }

    const facets = [
      {name: 'meta/status', field: 'meta/status', type: 'keyword'},
      ...mapping.map((k) => {
        return {name: k, field: k, type: properties[k].type};
      }),
    ];

    const filters = [
      {
        name: 'meta/status',
        value: quest.goblin.getX('defaultHiddenStatus', [
          'draft',
          'trashed',
          'archived',
        ]),
        displayName: getDisplayName('meta/status'),
        mappingType: 'keyword',
      },
      ...mapping.map((k) => {
        return {
          name: k,
          value: [],
          displayName: getDisplayName(k),
          mappingType: properties[k].type,
        };
      }),
    ];

    const res = yield elastic.generateFacets({
      type,
      facets,
    });

    const buckets = facets.reduce((buckets, f) => {
      switch (f.type) {
        default:
        case 'keyword':
          buckets[f.name] = res[f.name].buckets;
          break;
        case 'date':
          buckets[f.name] = {};
          buckets[f.name].agg = res[f.name].buckets;
          buckets[f.name].min = undefined;
          if (res[`${f.name}_min`] && res[`${f.name}_min`].value_as_string) {
            buckets[f.name].min = res[`${f.name}_min`].value_as_string.split(
              'T'
            )[0];
          }
          buckets[f.name].max = undefined;
          if (res[`${f.name}_max`] && res[`${f.name}_max`].value_as_string) {
            buckets[f.name].max = res[`${f.name}_max`].value_as_string.split(
              'T'
            )[0];
          }

          break;
      }

      return buckets;
    }, {});

    return {
      buckets,
      filters,
    };
  }

  static *executeSearch(quest, sort, filters, range) {
    const elastic = quest.getStorage('elastic');
    const value = quest.goblin.getX('value');
    quest.goblin.setX('highlights', []);

    const options = quest.goblin.getState().get('options').toJS();

    let from;
    let size;

    if (!range && sort) {
      range = quest.goblin.getX('range');

      from = range ? range[0] : undefined;
      size = range ? range[1] - range[0] + 1 : undefined;
    }

    if (range && sort) {
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
    let searchAfter = null;
    if (sort && from + size > 9999) {
      searchAfter = quest.goblin.getX('afterSearch');
      quest.log.dbg('searchAfter', searchAfter);
      if (!searchAfter) {
        quest.log.dbg('search cancelled');
        return [];
      }
    }

    let results = yield elastic.search({
      type,
      value,
      sort,
      filters: filters ? Object.values(filters) : null,
      from: searchAfter ? -1 : from,
      size,
      searchAfter,
      mustExist: true,
      source: false,
      termQueryFields: options.termQueryFields,
      dateQueryFields: options.dateQueryFields,
      searchMode: 'fulltext',
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
          ? MarkdownBuilder.emToBacktick(hit.highlight.searchPhonetic[0])
          : null;

      const auto =
        hit.highlight.searchAutocomplete &&
        hit.highlight.searchAutocomplete[0].includes('<em>')
          ? MarkdownBuilder.emToBacktick(hit.highlight.searchAutocomplete[0])
          : null;

      const info =
        hit.highlight.info && hit.highlight.info[0].includes('<em>')
          ? MarkdownBuilder.emToBacktick(hit.highlight.info[0])
          : null;

      const score = hit._score / 10; // TODO: Use best value!

      return {id, phonetic, auto, info, score};
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
      const lastResult = results.hits.hits[results.hits.hits.length - 1];
      const source = lastResult._source;

      let fieldType = 'string';
      let value = source[sortField];
      if (value) {
        const mapping = quest.goblin.getX('searchFieldMapping');

        if (mapping) {
          const info = mapping.properties[sortField];
          if (info) {
            fieldType = info.type;
          }
        }
        switch (fieldType) {
          case 'date':
            value = new Date(value).getTime();
        }
        quest.goblin.setX('afterSearch', [value, `${type}#${lastResult._id}`]);
      } else {
        quest.goblin.setX('afterSearch', null);
        quest.log.warn('next fetch will fail with aftersearch');
      }
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
  const goblinId = quest.goblin.id;
  quest.goblin.defer(
    quest.sub.local(`*::${goblinId}.<refresh-list-requested>`, function* (
      err,
      {msg, resp}
    ) {
      const {range} = msg.data;
      try {
        yield resp.cmd(`${goblinName}.refresh`, {id: goblinId, range});
      } catch (err) {
        resp.log.err(err.stack || err.message || err);
      }
    })
  );
  const evtDebouncer = new EventDebouncer(quest.newResponse(), 500);
  quest.goblin.setX('evtDebouncer', evtDebouncer);

  if (!options.defaultHiddenStatus) {
    options.defaultHiddenStatus = ['draft', 'trashed', 'archived'];
  }

  quest.goblin.setX('mutex', mutex);
  quest.goblin.setX('desktopId', desktopId);
  quest.goblin.setX('table', table);
  quest.goblin.setX('value', '');
  quest.goblin.setX('defaultHiddenStatus', options.defaultHiddenStatus);
  List.resolveMode(quest, options);

  const id = quest.goblin.id;
  const mode = quest.goblin.getX('mode');
  if (mode === 'empty') {
    return id;
  }

  if (mode === 'search') {
    let mapping = indexerMappingsByType.find(
      (mapping) => mapping.type === table
    );
    if (mapping) {
      options.termQueryFields = Object.entries(mapping.properties)
        .filter((kv) => kv[1].type === 'keyword')
        .map(([term]) => term);

      options.dateQueryFields = Object.entries(mapping.properties)
        .filter((kv) => kv[1].type === 'date')
        .map(([term]) => term);

      quest.goblin.setX('searchFieldMapping', mapping);
    }

    if (!columns) {
      console.log(`Loading list view option for ${table}...`);
      columns = [];
      const configuration = configurations[table];
      if (configuration.defaultSearchColumn) {
        columns.push(configuration.defaultSearchColumn);
      } else {
        columns.push({text: T('Info'), path: 'meta.summaries.info'});
      }
      columns.push({
        text: T('Statut fiche'),
        width: '110px',
        path: 'meta.status',
      });

      const defaultHandledProps = {
        status: {text: T('Statut métier'), width: '110px'},
        isReady: {text: T('Prêt ?'), width: '100px'},
        hasErrors: {text: T('Erreurs ?'), width: '100px'},
      };
      if (mapping) {
        for (const prop of Object.keys(mapping.properties)) {
          defaultHandledProps[prop] = {text: prop, width: '50px'};
        }
      }
      if (configuration.properties) {
        for (const prop of Object.keys(configuration.properties)) {
          const item = defaultHandledProps[prop];
          if (item) {
            const {description, text, type} = configuration.properties[prop];
            columns.push({
              text: text || item.text,
              type,
              description,
              width: item.width,
              path: prop,
            });
          }
        }
      }
      if (configuration.computer && configuration.sums.base) {
        columns.push({text: 'Total', path: 'sums.base'});
      }

      if (configuration.searchCustomColumns) {
        columns = columns.concat(configuration.searchCustomColumns);
      }
      const viewId = `view@${table}`;
      const wAPI = quest.getAPI('workshop');
      yield wAPI.createEntity({
        entityId: viewId,
        createFor: quest.goblin.id,
        desktopId,
        properties: {name: `${table}-view`},
      });
      const viewAPI = quest.getAPI(viewId);
      const metaStatus = yield quest.warehouse.get({
        path: `${viewId}.meta.status`,
      });
      // When code is changing, clear the batabase, by exemple http://localhost:9900/#dataexplorer
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
  yield quest.me.initList();

  if (mode === 'search') {
    const facets = yield* List.generateFacets(quest, table, columns);
    quest.dispatch('set-facets', {facets});
    const goblinId = quest.goblin.id;
    quest.goblin.defer(
      quest.sub(`*::${table}-<typed-index-changed>`, function* (
        err,
        {msg, resp}
      ) {
        yield resp.cmd(`${goblinName}.reload-search`, {
          id: goblinId,
          table,
          columns,
        });
      })
    );
    const count = yield* List.count(quest);
    quest.dispatch('set-count', {count, initial: true});
  } else {
    const count = yield* List.count(quest, options);
    quest.dispatch('set-count', {count, initial: true});
  }
  return id;
});

Goblin.registerQuest(goblinName, 'reload-search', function* (
  quest,
  table,
  columns
) {
  const facets = yield* List.updateFacets(quest, table, columns);
  quest.dispatch('set-facets', {facets});
  const count = yield* List.countIndex(quest, table);
  quest.dispatch('set-initial-count', {count});
  yield quest.me.refresh();
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
  yield quest.me.refresh();
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
  yield quest.me.refresh();
});

Goblin.registerQuest(goblinName, 'init-all-facets', function* (
  quest,
  filterName,
  keys
) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.refresh();
});

Goblin.registerQuest(goblinName, 'set-all-facets', function* (
  quest,
  filterName,
  keys
) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.refresh();
});

Goblin.registerQuest(goblinName, 'clear-all-facets', function* (
  quest,
  filterName,
  keys
) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.refresh();
});

Goblin.registerQuest(goblinName, 'toggle-all-facets', function* (
  quest,
  filterName,
  keys
) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.refresh();
});

Goblin.registerQuest(goblinName, 'set-range', function* (
  quest,
  filterName,
  from,
  to,
  mode
) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.refresh();
});

Goblin.registerQuest(goblinName, 'clear-range', function* (quest, filterName) {
  yield quest.doSync();
  const count = yield* List.count(quest);
  quest.dispatch('set-count', {count});
  yield quest.me.initList();
  yield quest.me.refresh();
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
  yield quest.me.refresh();
});

const setFilter = locks.getMutex;
Goblin.registerQuest(goblinName, 'set-filter-value', function* (
  quest,
  filterValue
) {
  try {
    if (filterValue.length > 0) {
      if (
        filterValue.length > 1 &&
        filterValue.startsWith('"') &&
        filterValue.endsWith('"')
      ) {
        //continue with uniq value search
      } else {
        //make multi value search
        filterValue = filterValue.split(' ').filter((v) => !!v);
      }
    }

    //skip if same
    const currentValue = quest.goblin.getX('value');
    if (JSON.stringify(filterValue) === JSON.stringify(currentValue)) {
      return;
    }
    const locky = `set-filter-for-${quest.goblin.id}`;
    quest.defer(() => setFilter.unlock(locky));
    yield setFilter.lock(locky);
    quest.goblin.setX('value', filterValue);
    const count = yield* List.count(quest);
    quest.dispatch('set-count', {count});
    yield quest.me.initList();
    yield quest.me.refresh();
  } catch {
    console.warn('FIXME: list disposed when UI set-filter-value');
  }
});

Goblin.registerQuest(goblinName, 'set-sort', function* (quest, key, dir) {
  const current = quest.goblin.getState().get('options.sort.key');
  quest.do({key, dir});
  if (key !== current) {
    quest.goblin.setX('searchAfter', null);
    quest.goblin.setX('range', null);
  }
  yield quest.me.refresh();
});

Goblin.registerQuest(goblinName, 'change-content-index', function* (
  quest,
  name,
  value
) {
  const contentIndex = {name, value};
  quest.evt('<content-index-changed>', contentIndex);

  const count = yield* List.count(quest, {contentIndex});
  quest.do({count});
  yield quest.me.initList();
  yield quest.me.refresh();
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
          yield quest.me.refresh();
          break;
        }

        case 'change': {
          quest.do();
          yield quest.me.refresh();
          break;
        }

        case 'remove': {
          quest.dispatch('remove');
          yield quest.me.refresh();
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

        yield quest.me.refresh();
      }

      break;
    }
  }
});

Goblin.registerQuest(goblinName, 'fetch', function (quest, range) {
  if (!quest.getDesktop(true)) {
    return; /* Stop here because the desktop is deleting */
  }
  const evtDebouncer = quest.goblin.getX('evtDebouncer');
  const goblinId = quest.goblin.id;
  if (range[1] - range[0] > 9999) {
    return;
  }
  evtDebouncer.publish(`${goblinId}.<refresh-list-requested>`, {range});
});

const fetchLock = locks.getMutex;
Goblin.registerQuest(goblinName, 'refresh', function* (quest, range) {
  if (!quest.getDesktop(true)) {
    return; /* Stop here because the desktop is deleting */
  }

  const locky = `fetch-for-${quest.goblin.id}`;
  yield fetchLock.lock(locky);
  quest.defer(() => fetchLock.unlock(locky));

  if (!range) {
    //refetch
    range = quest.goblin.getX('range') || [];
  } else {
    //new range requested from UI
    if (range[1] === -1) {
      range = [];
    }
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
});

// Create a Goblin with initial state and handlers
module.exports = Goblin.configure(goblinName, logicState, logicHandlers);
