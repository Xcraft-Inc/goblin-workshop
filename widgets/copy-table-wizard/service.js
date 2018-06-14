'use strict';
const {buildWizard} = require('goblin-desktop');

function buildTableList(tableList) {
  const data = {
    header: [
      {
        name: 'description',
        grow: '1',
        textAlign: 'left',
      },
    ],
    rows: [],
  };

  for (const table of tableList) {
    data.rows.push({
      id: table,
      description: table,
    });
  }

  return data;
}

/******************************************************************************/

const config = {
  name: 'copy-table',
  title: 'Copie de tables',
  dialog: {
    width: '500px',
  },
  gadgets: {
    tablesTable: {
      type: 'table',
      onActions: {
        select: (state, action) => {
          return state.set('form.selectedTables', action.get('selectedIds'));
        },
        doubleClick: null,
      },
    },
  },
  steps: {
    prepare: {
      mainButton: function*(quest, form) {
        const r = quest.getStorage('rethink');
        if (form.fromDb) {
          const tableList = yield r.listTableFromDb({fromDb: form.fromDb});

          quest.me.useTablesTable({
            action: 'setData',
            payload: {data: buildTableList(tableList)},
          });
        }

        const disabled = form.selectedTables && form.selectedTables.length < 1;
        return {
          glyph: 'solid/plus',
          text: 'Démarrer la copie',
          grow: disabled ? '0.5' : '2',
          disabled: disabled,
        };
      },
      form: {selectedIds: []},
      quest: function*(quest, form) {
        const r = quest.getStorage('rethink');
        const databases = yield r.listDb();
        quest.do({
          form: {fromTable: null, databases, fromDb: null},
        });
      },
    },
    finish: {
      form: {},
      quest: function*(quest, form, next) {
        const r = quest.getStorage('rethink');
        for (const table of form.selectedTables) {
          r.copyTableFromDb({fromDb: form.fromDb, table}, next.parallel());
        }
        yield next.sync();
        const desktop = quest.getAPI(quest.getDesktop());
        desktop.removeDialog({dialogId: quest.goblin.id});
      },
    },
  },
};

module.exports = buildWizard(config);
