'use strict';
//T:2019-02-27

const T = require('goblin-nabu');
const {buildWizard} = require('goblin-desktop');

const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const entityStorage = workshopConfig.entityStorageProvider.replace(
  'goblin-',
  ''
);

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
  name: 'reindex-entities',
  title: T('Réindexeur'),
  dialog: {
    width: '500px',
  },
  gadgets: {
    tablesTable: {
      type: 'table',
      onActions: {
        syncSelect: (state, action) => {
          return state.set('form.selectedTables', action.get('selectedIds'));
        },
        doubleClick: (state) => state,
      },
    },
  },
  steps: {
    initialize: {
      quest: function* (quest) {
        const r = quest.getStorage(entityStorage);
        const tableList = yield r.listTableFromDb({fromDb: quest.getSession()});
        yield quest.me.useTablesTable({
          action: 'setData',
          payload: {data: buildTableList(tableList)},
        });

        yield quest.me.next();
      },
    },
    prepare: {
      updateButtonsMode: 'onChange',
      buttons: function (quest, buttons, form) {
        const selectedTables = form.get('selectedTables');
        const disabled =
          !selectedTables || (selectedTables && selectedTables.length < 1);
        return buttons.set('main', {
          glyph: 'solid/sync',
          text: 'Démarrer la réindexation',
          grow: disabled ? '0.5' : '2',
          disabled: disabled,
        });
      },
      form: {
        resetIndex: false,
      },
      quest: function* (quest, form) {},
    },
    finish: {
      form: {},
      quest: function* (quest, form) {
        quest.evt('<reindex-entities-enqueue-requested>', {
          desktopId: quest.getDesktop(),
          userDesktopId: quest.getDesktop(),
          data: form,
        });
        yield quest.me.next();
      },
    },
  },
};

module.exports = buildWizard(config);
