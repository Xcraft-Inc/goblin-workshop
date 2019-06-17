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
        options: {contentIndex: {name: 'status', value: ['published']}},
      });
    }

    if (hinters) {
      for (const h of Object.keys(hinters)) {
        const hinterAPI = yield quest.create(`${h}-hinter`, {
          id: `${h}-finder@${quest.goblin.id}`,
          desktopId,
          workitemId: quest.goblin.id,
          withDetails: true,
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

    quest.do();
  });

  Goblin.registerQuest(goblinName, 'drill-down', function(
    quest,
    entityIds,
    view,
    _goblinFeed
  ) {
    quest.evt('drill-down-requested', {
      entityIds,
      view,
      _goblinFeed,
      desktopId: quest.goblin.getX('desktopId'),
    });
  });

  common.registerHinters(goblinName, hinters);

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
