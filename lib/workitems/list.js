const Goblin = require('xcraft-core-goblin');
const Papa = require('papaparse');
const mkdirp = require('mkdirp').sync;
const os = require('os');

const _p = require('path');
const fs = require('fs');

module.exports = config => {
  const {type, kind, columns, queries} = config;

  const goblinName = `${type}-${kind}`;

  const logicHandlers = {
    'create': (state, action) => {
      const config = {
        id: action.get('id'),
        type,
        columns: action.get('columns'),
        exporting: false,
        query: 'all',
        queriesPreset: queries ? Object.keys(queries).concat('all') : ['all'],
      };
      return state.set('', config);
    },
    'select-query': (state, action) => {
      return state.set('query', action.get('value'));
    },
    'toggleExporting': state => {
      return state.set('exporting', !state.get('exporting'));
    },
    'export-to-csv': s => s,
    'export-to-json': s => s,
  };

  Goblin.registerQuest(goblinName, 'create', function*(quest, desktopId) {
    quest.goblin.setX('desktopId', desktopId);

    const listServiceId = yield quest.createPlugin('list', {
      desktopId,
      table: type,
      options: {contentIndex: {name: 'id'}},
    });

    quest.goblin.setX('listServiceId', listServiceId.id);

    quest.do({columns});
  });

  Goblin.registerQuest(goblinName, 'drill-down', function(
    quest,
    entityIds,
    view
  ) {
    quest.evt('drill-down-requested', {
      entityIds,
      view,
      desktopId: quest.goblin.getX('desktopId'),
    });
  });

  Goblin.registerQuest(goblinName, 'select-query', function*(quest, value) {
    quest.do();
    const listAPI = quest.getAPI(quest.goblin.getX('listServiceId'));
    if (value !== 'all') {
      yield listAPI.changeOptions({
        options: {query: queries[value].toString()},
      });
    } else {
      yield listAPI.changeOptions({options: {contentIndex: {name: 'id'}}});
    }
  });

  ///////////////////////////EXPORTS//////////////////////////////////////
  const listExporter = require('./list-exporter.js');

  Goblin.registerQuest(goblinName, 'export-to-csv', function*(quest) {
    const desktopId = quest.getDesktop();
    quest.dispatch('toggleExporting');
    yield quest.doSync();

    const query = quest.goblin.getState().get('query');
    const data = yield listExporter(quest, {type, query, queries});

    console.time('building csv');
    const rows = Papa.unparse({
      data,
    });

    const tmpFolder = _p.join(os.tmpdir(), quest.uuidV4());
    mkdirp(tmpFolder);
    const fileName = `${quest.goblin.id.split('@')[0]}-${query}.csv`;
    const csvPath = _p.join(tmpFolder, fileName);
    console.log('writting file in a temp folder: ', csvPath);
    fs.writeFileSync(csvPath, rows);
    console.timeEnd('building csv');
    quest.dispatch('toggleExporting');
    const deskAPI = quest.getAPI(desktopId).noThrow();
    yield deskAPI.downloadFile({filePath: csvPath, openFile: true});
  });

  Goblin.registerQuest(goblinName, 'export-to-json', function*(quest, next) {
    const desktopId = quest.getDesktop();
    quest.dispatch('toggleExporting');
    yield quest.doSync();

    const query = quest.goblin.getState().get('query');
    const data = yield listExporter(quest, {
      type,
      query,
      queries,
      header: false,
      json: true,
    });
    console.time('fetching main documents');

    const tmpFolder = _p.join(os.tmpdir(), quest.uuidV4());
    mkdirp(tmpFolder);
    const fileName = `${quest.goblin.id.split('@')[0]}-${query}.json`;
    const filePath = _p.join(tmpFolder, fileName);
    console.log('writting file in a temp folder: ', filePath);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    quest.dispatch('toggleExporting');
    const deskAPI = quest.getAPI(desktopId).noThrow();
    yield deskAPI.downloadFile({filePath: filePath, openFile: true});
  });

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
