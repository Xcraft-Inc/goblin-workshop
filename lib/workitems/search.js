const Goblin = require('xcraft-core-goblin');
const common = require('./common.js');

module.exports = config => {
  const {
    type,
    name,
    kind,
    title,
    hintText,
    hinters,
    list,
    detailWidget,
    detailWidth,
    detailKind,
    listFilter,
    quests,
  } = config;

  let goblinName = `${type}-${kind}`;

  if (name) {
    goblinName = name;
  }

  const logicHandlers = {
    create: (state, action) => {
      const config = {
        id: action.get('id'),
        type,
        name,
        title: title || 'Recherche',
        hinter: action.get('hinter'),
        hintText: hintText || '',
      };
      return state.set('', config);
    },
  };

  if (quests) {
    Object.keys(quests).forEach(q =>
      Goblin.registerQuest(goblinName, q, quests[q])
    );
  }

  Goblin.registerQuest(goblinName, 'create', function*(quest, desktopId) {
    quest.goblin.setX('desktopId', desktopId);
    let listAPI = null;

    if (list) {
      listAPI = yield quest.createPlugin('list', {
        desktopId,
        table: list,
        filter: listFilter,
        orderBy: 'firstName',
        status: ['published'],
        options: {
          type,
          field: 'description',
          sort: {
            key: 'info.keyword',
            dir: 'asc',
          },
          filter: {
            name: 'status',
            value: ['published'],
          },
        },
      });
    }
    let hinter;
    if (hinters) {
      for (const h of Object.keys(hinters)) {
        hinter = h;
        let hName = h;
        if (hinters[h].hinter) {
          hName = hinters[h].hinter;
        }
        if (quest.hasAPI(`${hName}-hinter`)) {
          const hinterAPI = yield quest.create(`${hName}-hinter`, {
            id: `${h}-finder@${quest.goblin.id}`,
            desktopId,
            hinterName: h,
            workitemId: quest.goblin.id,
            withDetails: true,
            detailWidget: detailWidget,
            detailWidth: detailWidth,
            detailKind: detailKind,
          });
          if (listAPI) {
            quest.goblin.defer(
              quest.sub(`${listAPI.id}.content-index-changed`, function*(
                err,
                {msg}
              ) {
                if (msg.data.name === 'status') {
                  yield hinterAPI.setStatus({status: msg.data.value});
                }
              })
            );
          }
        }
      }
    }

    quest.do({hinter});
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

  common.registerHinters(goblinName, hinters);

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
