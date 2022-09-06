const Goblin = require('xcraft-core-goblin');
const T = require('goblin-nabu');
const workshopConfig = require('xcraft-core-etc')().load('goblin-workshop');
const entityStorage = workshopConfig.entityStorageProvider.replace(
  'goblin-',
  ''
);

exports.xcraftCommands = function () {
  return Goblin.buildQueueWorker('rehydrate-entities', {
    workQuest: function* (quest, desktopId, userDesktopId, data, next) {
      const desktop = quest.getAPI(userDesktopId).noThrow();
      const r = quest.getStorage(entityStorage);
      const tables = data.selectedTables.join(', ');
      const tablesNumber = data.selectedTables.length;
      yield desktop.addNotification({
        notificationId: `notification@${quest.uuidV4()}`,
        glyph: 'solid/download',
        color: 'blue',
        message: T(
          `Recupération des entités {length, plural, one {de la table {tables}} other {des tables: {tables}s}}`,
          null,
          {
            length: tablesNumber,
            tables,
          }
        ),
      });

      const statuses = ['Published', 'Draft', 'Archived']
        .filter((status) => !!data[`status${status}`])
        .map((status) => status.toLocaleLowerCase());

      for (const table of data.selectedTables) {
        const getInfo = (r, table, statuses) => {
          let q = r.table(table).getAll(r.args(statuses), {index: 'status'});
          return q
            .pluck('id', {
              meta: ['rootAggregateId', 'rootAggregatePath', 'type'],
            })
            .map(function (doc) {
              return {
                id: doc('id'),
                root: doc('meta')('rootAggregateId'),
                path: doc('meta')('rootAggregatePath'),
                type: doc('meta')('type'),
              };
            });
        };

        const query = getInfo.toString();
        const args = [table, statuses];
        r.query({query, args}, next.parallel());
      }

      const forRehydrate = yield next.sync();
      const hydrateClassifier = forRehydrate.reduce(
        (state, entities) => {
          const roots = entities.filter((entity) => entity.path.length === 0);
          const leefs = entities.filter((entity) => entity.path.length > 0);
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
      let totalLength = 0;
      const orderedHydratation = Object.keys(hydrateClassifier).reduce(
        (order, index) => {
          const entities = hydrateClassifier[index];
          totalLength += entities.length;
          order.push(entities);
          return order;
        },
        []
      );
      const reverseHydratation = orderedHydratation.reverse();
      let count = 1;
      const batchSize = 100;
      const progressNotificationId = `notification@${quest.uuidV4()}`;
      yield desktop.addNotification({
        notificationId: `notification@${quest.uuidV4()}`,
        glyph: 'solid/play',
        color: 'blue',
        message: T(
          `Début de l'hydratation {length, plural, one {de la table {tables}} other {des tables: {tables}s}}`,
          null,
          {
            length: tablesNumber,
            tables,
          }
        ),
      });
      for (const [key, entities] of reverseHydratation.entries()) {
        // const current = key + 1;
        // const total = reverseHydratation.length;
        if (entities.length > 0) {
          for (const entity of entities) {
            const requestId = quest.uuidV4();
            quest.evt('<hydrate-entity-requested>', {
              desktopId: quest.getDesktop(),
              requestId,
              entityId: entity.id,
              rootAggregateId: entity.root,
              rootAggregatePath: entity.path,
              muteChanged: true,
              muteHydrated: data.emitHydrated === false,
              notify: false,
              force: true,
              options: {
                rebuildValueCache: data.mustRebuild === true,
                buildSummaries: data.mustBuildSummaries === true,
                buildViews: data.mustBuildViews === true,
                buildAlerts: data.mustBuildAlerts === true,
                buildProps: data.mustBuildProps === true,
                compute: data.mustCompute === true,
                index: data.mustIndex === true,
              },
            });
            if (count % batchSize === 0 || totalLength < batchSize) {
              const progress = (count / totalLength) * 100;
              yield quest.sub.wait(`*::*.${requestId}-hydrate.done`);
              yield desktop.addNotification({
                notificationId: progressNotificationId,
                glyph: 'solid/leaf',
                color: 'blue',
                //- message: `(${current}/${total}) ${progress.toFixed(0)} %`,
                current: progress,
                total: 100,
              });
            }
            count++;
          }
        }
      }

      yield desktop.addNotification({
        notificationId: progressNotificationId,
        glyph: 'solid/beer',
        //- color: 'blue',
        //- message: T(
        //-   `100 % {length, plural, one {de la table hydratée} other {des tables hydratées}}`,
        //-   null,
        //-   {
        //-     length: tablesNumber,
        //-   }
        //- ),
        color: 'green',
        message: T('Réhydratation terminée'),
      });
    },
  });
};
