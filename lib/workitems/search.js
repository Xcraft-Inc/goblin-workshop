const Goblin = require('xcraft-core-goblin');
const common = require('./common.js');

module.exports = config => {
  const {type, name, kind, title, hintText, hinters, list, listFilter} = config;

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

  Goblin.registerQuest(goblinName, 'create', function*(quest, desktopId) {
    quest.goblin.setX('desktopId', desktopId);
    let listAPI = null;

    if (list) {
      listAPI = yield quest.createPlugin('list', {
        desktopId,
        table: list,
        filter: listFilter,
        orderBy: 'firstName',
      });
    }

    if (hinters) {
      for (const h of Object.keys(hinters)) {
        const hinterAPI = yield quest.create(`${h}-hinter`, {
          id: `${h}-finder@${quest.goblin.id}`,
          desktopId,
          workitemId: quest.goblin.id,
          withDetails: true,
        });
        if (listAPI) {
          quest.goblin.defer(
            quest.sub(`${listAPI.id}.status-changed`, (err, msg) =>
              hinterAPI.setStatus(msg.data)
            )
          );
        }
      }
    }

    quest.do();
  });

  common.registerHinters(goblinName, hinters);

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
