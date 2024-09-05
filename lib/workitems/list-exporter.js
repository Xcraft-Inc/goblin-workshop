const watt = require('gigawatts');
const Shredder = require('xcraft-core-shredder');
const T = require('goblin-nabu/widgets/helpers/t.js');
const Tr = require('goblin-nabu/lib/tr.js');
const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const entityStorage = workshopConfig.entityStorageProvider.replace(
  'goblin-',
  ''
);
const {ListHelpers} = require('goblin-workshop');
const {
  getColumnTargetPath,
  getColumnPath,
  getColumnSubPath,
  getColumnHeaderText,
  isTargetingValueOrRef,
  isTargetingValue,
} = ListHelpers;

const {referenceUseArity} = require('./common.js');
const isTargetingValueCollection = (entity, path, targetPath) => {
  if (path !== targetPath) {
    return false;
  }
  return referenceUseArity(entity.get(`meta.values.${targetPath}`));
};

const isTargetingReferenceCollection = (entity, path, targetPath) => {
  if (path !== targetPath) {
    return false;
  }
  return referenceUseArity(entity.get(`meta.references.${targetPath}`));
};

const normalize = (value) => {
  if (value && value.toJS) {
    return value.toJS();
  } else {
    return value;
  }
};

const getTranslatedValue = watt(function* (quest, localeName, value, next) {
  if (Shredder.isImmutable(value) || Shredder.isShredder(value)) {
    value = value.toJS();
    if (value._type === 'translatableString') {
      const translations = [];
      for (const msg of value._string) {
        if (msg.nabuId) {
          const tr = yield Tr(quest, localeName, msg, true, next);
          translations.push(tr);
        } else {
          translations.push(msg);
        }
      }
      return translations.join(' ');
    } else {
      return yield Tr(quest, localeName, value, true, next);
    }
  } else {
    return value;
  }
});

module.exports = watt(function* (quest, options, next) {
  const {
    type,
    query,
    queries,
    header = true,
    json = false,
    localeName = 'fr_CH',
  } = options;

  const cols = quest.goblin.getState().get('columns');
  let fieldGetter = getColumnHeaderText;
  if (json) {
    fieldGetter = (c) => c.get('path');
  }
  let fields = cols
    .map((c) => fieldGetter(c))
    .valueSeq()
    .toArray();
  let paths = cols.map((c) => {
    return {
      path: getColumnPath(c),
      targetPath: getColumnTargetPath(c),
      subPath: getColumnSubPath(c),
    };
  });

  //special case for JSON:
  //replace duplicated id field, by an exportedAt field
  //see final reduce for data injection.
  if (json) {
    fields[1] = 'exportedAt';
  }

  let data = [];
  //Adding header row
  if (header) {
    data.push(fields);
  }
  const r = quest.getStorage(entityStorage);
  let mainDocuments;

  if (query !== 'all') {
    mainDocuments = yield r.query({
      query: queries[query].toString(),
      args: [],
    });
  } else {
    const count = yield r.count({table: type});
    //hard limit all query to 100'000
    if (count > 100000) {
      throw new Error('Too much rows, export is limited to 100,000 rows');
    }
    mainDocuments = yield r.getAll({table: type});
  }

  const referencesToFetch = {};

  for (const doc of mainDocuments) {
    const row = [];
    const entity = new Shredder(doc);

    for (const v of paths.values()) {
      const {targetPath, path, subPath} = v;
      if (path === 'id') {
        row.push(entity.get('id'));
        continue;
      }
      if (isTargetingValueOrRef(entity, targetPath)) {
        if (isTargetingValue(entity, targetPath)) {
          if (isTargetingValueCollection(entity, path, targetPath)) {
            const ids = entity.get(path);
            const collection = [];
            if (ids) {
              for (const id of ids) {
                const value = entity.get(`private.${targetPath}.${id}`);
                if (value) {
                  const trValue = yield getTranslatedValue(
                    quest,
                    localeName,
                    value.get(subPath)
                  );
                  collection.push(trValue);
                }
              }
            }
            if (json) {
              row.push(collection);
            } else {
              row.push(collection.join('|'));
            }
          } else {
            const valueId = entity.get(path);
            if (valueId) {
              const value = entity.get(`private.${targetPath}.${valueId}`);
              row.push(value.get(subPath));
            } else {
              row.push('');
            }
          }
        } else {
          if (isTargetingReferenceCollection(entity, path, targetPath)) {
            const collection = [];
            let type = null;
            for (const refId of entity.get(path)) {
              const refType = refId.split('@', 1)[0];
              if (!type) {
                type = refType;
              }
              if (!referencesToFetch[refType]) {
                referencesToFetch[refType] = {};
              }
              referencesToFetch[refType][refId] = refId;
              collection.push(refId);
            }
            row.push({collection, type});
          } else {
            const refId = entity.get(path);
            if (refId) {
              const refType = refId.split('@', 1)[0];
              if (!referencesToFetch[refType]) {
                referencesToFetch[refType] = {};
              }
              referencesToFetch[refType][refId] = refId;
              row.push({type: refType, id: refId});
            } else {
              row.push('');
            }
          }
        }
      } else {
        row.push(entity.get(path));
      }
    }
    data.push(row);
  }

  const promises = [];
  const fetchOrder = Object.keys(referencesToFetch);
  for (const type of fetchOrder) {
    promises.push(
      r.getAll({table: type, documents: Object.keys(referencesToFetch[type])})
    );
  }
  const fetched = yield Promise.all(promises);
  for (const type of fetchOrder) {
    const i = fetchOrder.indexOf(type);
    fetched[i].reduce((references, r) => {
      if (r.id) {
        references[type][r.id] = new Shredder(r);
      }
      return references;
    }, referencesToFetch);
  }

  data.reduce((data, row, i) => {
    data[i].reduce((row, v, z) => {
      if (v && typeof v === 'object') {
        let path = paths.get(z).subPath;
        if (!path) {
          path = 'meta.summaries.info';
        }

        if (v && v.collection) {
          const collection = v.collection.reduce((col, id) => {
            if (
              referencesToFetch[v.type][id] &&
              referencesToFetch[v.type][id].get
            ) {
              col.push(referencesToFetch[v.type][id].get(path));
            }
            return col;
          }, []);

          row[z] = collection;
          if (!json) {
            row[z] = row[z].join('|');
          }
          return row;
        }
        if (v && v.id) {
          if (
            referencesToFetch[v.type][v.id] &&
            referencesToFetch[v.type][v.id].get
          ) {
            row[z] = referencesToFetch[v.type][v.id].get(path);
          } else {
            row[z] = '';
          }
          return row;
        }
      }

      return row;
    }, data[i]);
    return data;
  }, data);

  data = data.map((rows) => rows.map(normalize));

  if (json) {
    //build exportedAt
    const exportedAt = new Date().toISOString();
    return data.map((r) =>
      r.reduce((state, row, i) => {
        if (fields[i] === 'exportedAt') {
          state.exportedAt = exportedAt;
          return state;
        }
        state[fields[i]] = row;
        return state;
      }, {})
    );
  } else {
    return data;
  }
});
