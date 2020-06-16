const Goblin = require('xcraft-core-goblin');
const Papa = require('papaparse');
const {mkdir} = require('xcraft-core-fs');
const os = require('os');

const _p = require('path');
const fs = require('fs');

module.exports = (config) => {
  const {type, kind, columns, queries} = config;

  const goblinName = `${type}-${kind}`;

  const logicHandlers = {
    'create': (state, action) => {
      const config = {
        id: action.get('id'),
        type,
        exporting: false,
        loading: false,
        columns: [{text: 'id', path: 'id'}].concat(columns),
        query: 'none',
        queriesPreset: queries
          ? Object.keys(queries).concat('all', 'none')
          : ['all', 'none'],
      };
      return state.set('', config);
    },
    'select-query': (state, action) => {
      return state.set('query', action.get('value'));
    },
    'toggleExporting': (state) => {
      return state.set('exporting', !state.get('exporting'));
    },
    'toggleLoading': (state) => {
      return state.set('loading', !state.get('loading'));
    },
    'export-to-csv': (s) => s,
    'export-to-json': (s) => s,
  };

  Goblin.registerQuest(goblinName, 'create', function (quest, desktopId) {
    quest.goblin.setX('desktopId', desktopId);

    /*const listServiceId = yield quest.createPlugin('list', {
      desktopId,
      table: type,
      options: {empty: true},
      columns,
    });

    quest.goblin.setX('listServiceId', listServiceId.id);*/

    quest.do({columns});
  });

  Goblin.registerQuest(goblinName, 'drill-down', function (
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

  Goblin.registerQuest(goblinName, 'select-query', function* (quest, value) {
    quest.dispatch('toggleLoading');
    yield quest.doSync();
    /*const listAPI = quest.getAPI(quest.goblin.getX('listServiceId'));
    switch (value) {
      case 'all':
        yield listAPI.changeOptions({options: {contentIndex: {name: 'id'}}});
        break;
      case 'none':
        yield listAPI.clear();
        break;
      default:
        yield listAPI.changeOptions({
          options: {query: queries[value].toString()},
        });
    }*/
    quest.dispatch('toggleLoading');
  });

  ///////////////////////////EXPORTS//////////////////////////////////////
  const getExportFilePath = function* (quest, desktopId, query, ext, fileName) {
    if (!fileName) {
      fileName = `${quest.goblin.id.split('@')[0]}-${query}.${ext}`;
    } else {
      fileName = `${fileName}.${ext}`;
    }
    const workshopAPI = quest.getAPI('workshop');
    const storageRootPath = yield workshopAPI.getMandateStorageRootPath({
      desktopId,
    });
    if (storageRootPath) {
      const filePath = _p.normalize(`${storageRootPath}/exports/${fileName}`);
      console.log('writting file in storage exports folder: ', filePath);
      return filePath;
    } else {
      const tmpFolder = _p.join(os.tmpdir(), quest.uuidV4());
      mkdir(tmpFolder);

      const filePath = _p.join(tmpFolder, fileName);
      console.log('writting file in a temp folder: ', filePath);
      return filePath;
    }
  };

  const listExporter = require('./list-exporter.js');

  Goblin.registerQuest(goblinName, 'export-to-csv', function* (
    quest,
    skipDownload,
    fileName
  ) {
    const desktopId = quest.getDesktop();
    const query = quest.goblin.getState().get('query');
    if (query === 'none') {
      return;
    }
    quest.dispatch('toggleExporting');
    yield quest.doSync();

    const data = yield listExporter(quest, {type, query, queries});

    console.time('building csv');
    const rows = Papa.unparse({
      data,
    });

    const filePath = yield* getExportFilePath(
      quest,
      desktopId,
      query,
      'csv',
      fileName
    );
    fs.writeFileSync(filePath, rows);
    console.timeEnd('building csv');
    quest.dispatch('toggleExporting');
    if (!skipDownload) {
      const deskAPI = quest.getAPI(desktopId).noThrow();
      yield deskAPI.downloadFile({filePath, openFile: true});
    }
  });

  Goblin.registerQuest(goblinName, 'export-to-json', function* (
    quest,
    skipDownload,
    fileName
  ) {
    const desktopId = quest.getDesktop();
    const query = quest.goblin.getState().get('query');
    if (query === 'none') {
      return;
    }
    quest.dispatch('toggleExporting');
    yield quest.doSync();

    const data = yield listExporter(quest, {
      type,
      query,
      queries,
      header: false,
      json: true,
    });
    console.time('fetching main documents');

    const filePath = yield* getExportFilePath(
      quest,
      desktopId,
      query,
      'json',
      fileName
    );
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    quest.dispatch('toggleExporting');
    if (!skipDownload) {
      const deskAPI = quest.getAPI(desktopId).noThrow();
      yield deskAPI.downloadFile({filePath, openFile: true});
    }
  });

  Goblin.registerQuest(goblinName, 'delete', function (quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
