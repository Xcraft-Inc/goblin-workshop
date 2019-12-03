const watt = require('gigawatts');
const Shredder = require('xcraft-core-shredder');
const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const entityStorage = workshopConfig.entityStorageProvider.replace(
  'goblin-',
  ''
);
const {ListHelpers} = require('goblin-toolbox');
const {
  getColumnTargetPath,
  getColumnPath,
  getColumnSubPath,
  getColumnText,
  isTargetingValueOrRef,
  isTargetingValue,
} = ListHelpers;

module.exports = watt(function*(quest, options, next) {
  const {type, query, queries, header = true, json = false} = options;

  const cols = quest.goblin.getState().get('columns');
  let fieldGetter = getColumnText;
  if (json) {
    fieldGetter = c => c.get('path');
  }
  let fields = cols.map(c => fieldGetter(c)).toArray();
  let paths = cols.map(c => {
    return {
      path: getColumnPath(c),
      targetPath: getColumnTargetPath(c),
      subPath: getColumnSubPath(c),
    };
  });

  let data = [];
  //Adding header row
  if (header) {
    data.push(fields);
  }
  const r = quest.getStorage(entityStorage);
  console.time('fetching main documents');
  let mainDocuments;
  if (query !== 'all') {
    mainDocuments = yield r.query({
      query: queries[query].toString(),
      args: [],
    });
  } else {
    mainDocuments = yield r.getAll({table: type});
  }

  console.timeEnd('fetching main documents');
  const referencesToFetch = {};
  console.time('building main rows');
  for (const doc of mainDocuments) {
    const row = [];
    const entity = new Shredder(doc);

    for (const v of paths.values()) {
      const {targetPath, path, subPath} = v;
      if (isTargetingValueOrRef(entity, targetPath)) {
        if (isTargetingValue(entity, targetPath)) {
          const valueId = entity.get(path);
          if (valueId) {
            const value = entity.get(`private.${targetPath}.${valueId}`);
            row.push(value.get(subPath));
          } else {
            row.push('');
          }
        } else {
          const refId = entity.get(path);
          if (refId) {
            const refType = refId.split('@')[0];
            if (!referencesToFetch[refType]) {
              referencesToFetch[refType] = {};
            }
            referencesToFetch[refType][refId] = refId;
            row.push({type: refType, id: refId});
          } else {
            row.push('');
          }
        }
      } else {
        row.push(entity.get(path));
      }
    }
    data.push(row);
  }
  console.timeEnd('building main rows');
  console.time('fetching references');
  const fetchOrder = Object.keys(referencesToFetch);
  for (const type of fetchOrder) {
    r.getAll(
      {table: type, documents: Object.keys(referencesToFetch[type])},
      next.parallel()
    );
  }
  const fetched = yield next.sync();
  for (const type of fetchOrder) {
    const i = fetchOrder.indexOf(type);
    fetched[i].reduce((references, r) => {
      if (r.id) {
        references[type][r.id] = new Shredder(r);
      }
      return references;
    }, referencesToFetch);
  }
  console.timeEnd('fetching references');
  console.time('reducing references to rows');
  data.reduce((data, row, i) => {
    data[i].reduce((row, v, z) => {
      if (v && v.id) {
        let path = paths.get(z).subPath;
        if (!path) {
          path = 'meta.summaries.info';
        }
        if (
          referencesToFetch[v.type][v.id] &&
          referencesToFetch[v.type][v.id].get
        ) {
          row[z] = referencesToFetch[v.type][v.id].get(path);
        } else {
          row[z] = '';
        }
      }
      return row;
    }, data[i]);
    return data;
  }, data);
  console.timeEnd('reducing references to rows');
  if (json) {
    return data.map(r =>
      r.reduce((state, row, i) => {
        state[fields[i]] = row;
        return state;
      }, {})
    );
  } else {
    return data;
  }
});