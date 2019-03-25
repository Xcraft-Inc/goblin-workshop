const Goblin = require('xcraft-core-goblin');
const xBus = require('xcraft-core-bus');
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
    listFilter,
    afterFetch,
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

  if (afterFetch) {
    Goblin.registerQuest(goblinName, 'after-fetch', afterFetch);
  }

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
        contentIndex: {name: 'status', value: ['published']},
        callAfterFetch: afterFetch ? true : false,
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
        });
        if (listAPI) {
          quest.goblin.defer(
            quest.sub(`${listAPI.id}.content-index-changed`, (err, msg) => {
              if (msg.data.name === 'status') {
                hinterAPI.setStatus({status: msg.data.value});
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
    _goblinFeed
  ) {
    quest.evt('drill-down-requested', {
      entityIds,
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
