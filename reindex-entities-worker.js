const path = require('path');
const os = require('os');
const Papa = require('papaparse');
const Goblin = require('xcraft-core-goblin');
const fse = require('fs-extra');

exports.xcraftCommands = function () {
  return Goblin.buildQueueWorker('reindex-entities', {
    workQuest: function* (quest, desktopId, userDesktopId, data) {
      const workshopAPI = quest.getAPI('workshop');

      if (data.resetIndex) {
        yield workshopAPI.resetIndex();
      }

      const nabu = yield quest.warehouse.get({path: 'nabu'});
      const locales = nabu.get('locales');

      //const desktop = quest.getAPI(desktopId).noThrow();
      let reportData = [];
      for (const table of data.selectedTables) {
        const data = yield workshopAPI.reindexEntitiesFromStorage({
          desktopId,
          type: table,
          status: ['draft', 'trashed', 'archived', 'published'],
          batchSize: 200,
          locales,
        });
        if (data && data.length > 0) {
          reportData = reportData.concat(data);
        }
      }

      /* FIXME: it's ugly, all logged users should be able to download the report */
      const session = quest.getSession();
      const filePath = path.join(os.tmpdir(), `${session}-reindex-report.csv`);
      try {
        const rows = Papa.unparse(reportData, {delimiter: ';'});

        if (reportData.length !== 0) {
          fse.writeFileSync(filePath, rows);
          const deskAPI = quest.getAPI(userDesktopId);
          yield deskAPI.downloadFile({filePath, openFile: true});
        }
      } finally {
        fse.removeSync(filePath);
      }
    },
  });
};
