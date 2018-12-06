const Goblin = require('xcraft-core-goblin');
const Papa = require('papaparse');
const Shredder = require('xcraft-core-shredder');
const {ListHelpers} = require('goblin-toolbox');
const fs = require('fs');
const {
  getColumnTargetPath,
  getColumnPath,
  getColumnSubPath,
  getColumnText,
  isTargetingValueOrRef,
  isTargetingValue,
} = ListHelpers;

module.exports = config => {
  const {type, kind, columns} = config;

  const goblinName = `${type}-${kind}`;

  const logicHandlers = {
    create: (state, action) => {
      const config = {
        id: action.get('id'),
        type,
        columns: action.get('columns'),
        exporting: false,
      };
      return state.set('', config);
    },
    toggleExporting: state => {
      return state.set('exporting', !state.get('exporting'));
    },
    'export-to-csv': s => s,
  };

  Goblin.registerQuest(goblinName, 'create', function*(quest, desktopId) {
    quest.goblin.setX('desktopId', desktopId);

    yield quest.createPlugin('list', {
      desktopId,
      table: type,
      contentIndex: {name: 'id'},
    });

    quest.do({columns});
  });

  Goblin.registerQuest(goblinName, 'drill-down', function*(
    quest,
    entityIds,
    next
  ) {
    entityIds.forEach(entityId =>
      quest.createFor(
        'list.drill-down',
        'none',
        entityId,
        {
          id: entityId,
          mustExist: true,
          desktopId: quest.goblin.getX('desktopId'),
          _goblinTTL: 30000,
        },
        next.parallel()
      )
    );
    yield next.sync();
  });

  Goblin.registerQuest(goblinName, 'export-to-csv', function*(quest, next) {
    quest.dispatch('toggleExporting');
    yield quest.doSync();
    const os = require('os');
    const _p = require('path');
    const home = _p.normalize(`${os.homedir()}`);

    const cols = quest.goblin.getState().get('columns');
    let fields = cols.map(c => getColumnText(c));
    let paths = cols.map(c => {
      return {
        path: getColumnPath(c),
        targetPath: getColumnTargetPath(c),
        subPath: getColumnSubPath(c),
      };
    });
    let data = [];
    //Adding header row
    data.push(fields.toArray());
    const r = quest.getStorage('rethink');
    console.time('fetching main documents');
    const mainDocuments = yield r.getAll({table: type});
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
    console.time('building csv');
    const rows = Papa.unparse({
      fields,
      data,
    });
    const csvPath = _p.normalize(`${home}/${type}.csv`);
    fs.writeFileSync(csvPath, rows);
    console.timeEnd('building csv');
    quest.dispatch('toggleExporting');
    const desktopId = quest.getDesktop();
    const deskAPI = quest.getAPI(desktopId);
    yield deskAPI.addNotification({
      color: 'green',
      message: `liste CSV exportée sous ${csvPath}`,
      glyph: 'solid/check',
    });
  });

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
