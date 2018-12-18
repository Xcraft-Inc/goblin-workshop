'use strict';
const {buildWizard} = require('goblin-desktop');
const Shredder = require('xcraft-core-shredder');
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
    initialize: {
      quest: function*(quest) {
        const r = quest.getStorage('rethink');
        const tableList = yield r.listTableFromDb({fromDb: quest.getSession()});
        quest.me.useTablesTable({
          action: 'setData',
          payload: {data: buildTableList(tableList)},
        });

        quest.me.next();
      },
    },
    prepare: {
      updateButtonsMode: 'onChange',
      buttons: function(quest, buttons, form) {
        const selectedTables = form.get('selectedTables');
        const disabled =
          !selectedTables || (selectedTables && selectedTables.length < 1);
        return buttons.set('main', {
          glyph: 'solid/sync',
          text: 'Démarrer la réhydratation',
          grow: disabled ? '0.5' : '2',
          disabled: disabled,
        });
      },
      form: {
        mustRebuild: 'false',
        mustCompute: 'false',
        mustBuildSummaries: 'true',
        mustIndex: 'false',
        onlyPublished: 'true',
      },
      quest: function*(quest, form) {},
    },
    finish: {
      form: {},
      quest: function*(quest, form, next) {
        const desktopId = quest.getDesktop();
        const desktop = quest.getAPI(desktopId);
        const r = quest.getStorage('rethink');
        for (const table of form.selectedTables) {
          const getInfo = (r, table, onlyPublished) => {
            let q = r.table(table);
            if (onlyPublished === 'true') {
              q = q.getAll('published', {index: 'status'});
            }
            return q
              .pluck('id', {
                meta: ['rootAggregateId', 'rootAggregatePath', 'type'],
              })
              .map(function(doc) {
                return {
                  id: doc('id'),
                  root: doc('meta')('rootAggregateId'),
                  path: doc('meta')('rootAggregatePath'),
                  type: doc('meta')('type'),
                };
              });
          };

          const query = getInfo.toString();
          const args = [table, form.onlyPublished];
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
          if (entities.length > 0) {
            const table = entities[0].type;
            desktop.addNotification({
              color: 'blue',
              message: `Récupération des ${entities.length} ${table}(s)`,
            });
            const fetched = yield r.getAll({
              table,
              documents: entities.map(e => e.id),
            });
            desktop.addNotification({
              color: 'blue',
              message: `Hydratation des ${entities.length} ${table}(s)...`,
            });

            let count = 0;
            const batchSize = 100;
            for (const entity of fetched) {
              count++;
              quest.evt('hydrate-entity-requested', {
                desktopId: quest.getDesktop(),
                entity: new Shredder(entity),
                muteChanged: true,
                notify: false,
                options: {
                  rebuildValueCache: form.mustRebuild === 'true',
                  buildSummaries: form.mustBuildSummaries === 'true',
                  compute: form.mustCompute === 'true',
                  index: form.mustIndex === 'true',
                },
              });
              if (count % batchSize === 0) {
                yield quest.sub.wait(`*::*.${entity.id}-hydrate-done`);
                const progress = (count / fetched.length) * 100;
                desktop.addNotification({
                  notificationId: table,
                  color: 'blue',
                  message: `${progress.toFixed(0)} % de ${table}`,
                });
              }
            }
            desktop.addNotification({
              notificationId: table,
              color: 'blue',
              message: `100 % de ${table}`,
            });
          }
        }

        quest.me.next();
      },
    },
  },
};

module.exports = buildWizard(config);
