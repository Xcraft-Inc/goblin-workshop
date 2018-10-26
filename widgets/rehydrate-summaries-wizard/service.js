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
  name: 'rehydrate-summaries',
  title: 'Réhydratation des descriptions',
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
      onChange: function*(quest) {
        const r = quest.getStorage('rethink');
        const tableList = yield r.listTableFromDb({fromDb: quest.getSession()});
        quest.me.useTablesTable({
          action: 'setData',
          payload: {data: buildTableList(tableList)},
        });
      },
      updateButtonsMode: 'onChange',
      buttons: function(quest, buttons, form) {
        const selectedTables = form.get('selectedTables');
        const disabled =
          !selectedTables || (selectedTables && selectedTables.length < 1);
        return buttons.set('main', {
          glyph: 'solid/plus',
          text: 'Démarrer la copie',
          grow: disabled ? '0.5' : '2',
          disabled: disabled,
        });
      },
      form: {},
      quest: function*(quest, form) {},
    },
    finish: {
      form: {},
      quest: function*(quest, form, next) {
        const desktopId = quest.getDesktop();
        const desktop = quest.getAPI(desktopId);
        const r = quest.getStorage('rethink');
        for (const table of form.selectedTables) {
          const getInfo = (r, table) => {
            return r
              .table(table)
              .pluck('id', {meta: ['rootAggregateId', 'rootAggregatePath']})
              .map(function(doc) {
                return {
                  id: doc('id'),
                  root: doc('meta')('rootAggregateId'),
                  path: doc('meta')('rootAggregatePath'),
                };
              });
          };

          const query = getInfo.toString();
          const args = [table];
          r.query({query, args}, next.parallel());
        }

        const forRehydrate = yield next.sync();
        const hydrateClassifier = forRehydrate.reduce(
          (state, entities) => {
            const roots = entities.filter(entity => entity.path.length === 0);
            const leefs = entities.filter(entity => entity.path.length > 0);
            state[0] = state[0].concat(roots);
            leefs.reduce((state, leef) => {
              const lvl = leef.path.length;
              if (!state[lvl]) {
                state[lvl] = [];
              }
              state[lvl].push(leef);
              return state;
            }, state);
            return state;
          },
          {0: []}
        );
        const orderedHydratation = Object.keys(hydrateClassifier).reduce(
          (order, index) => {
            const entities = hydrateClassifier[index];
            order.push(entities);
            return order;
          },
          []
        );
        const reverseHydratation = orderedHydratation.reverse();
        for (const entities of reverseHydratation) {
          desktop.addNotification({
            color: 'blue',
            message: 'Chargement des entités...',
          });
          for (const entity of entities) {
            quest.create(
              entity.id,
              {id: entity.id, desktopId},
              next.parallel()
            );
          }
          const apis = yield next.sync();
          desktop.addNotification({
            color: 'blue',
            message: 'Hydratation des entités...',
          });
          for (const api of apis) {
            api.hydrate({}, next.parallel());
          }
          yield next.sync();
          desktop.addNotification({
            color: 'blue',
            message: 'Sauvegarde des entités...',
          });
          for (const api of apis) {
            api.persist({}, next.parallel());
          }
          yield next.sync();
          desktop.addNotification({
            color: 'blue',
            message: 'Déchargement des entités...',
          });
          for (const entity of entities) {
            quest.release(entity.id);
          }
        }

        quest.me.next();
      },
    },
  },
};

module.exports = buildWizard(config);
