const Goblin = require('xcraft-core-goblin');
const common = require('./common.js');

module.exports = (config) => {
  const {
    type,
    name,
    workitems,
    kind,
    title,
    hintText,
    hinters,
    list,
    detailWidget,
    detailWidth,
    detailKind,
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
        hinterId: action.get('hinterId'),
        hintText: hintText || '',
      };
      return state.set('', config);
    },
  };

  if (quests) {
    Object.keys(quests).forEach((q) =>
      Goblin.registerQuest(goblinName, q, quests[q])
    );
  }

  Goblin.registerQuest(goblinName, 'create', function* (
    quest,
    desktopId,
    clientSessionId
  ) {
    quest.goblin.setX('desktopId', desktopId);
    let listAPI = null;

    if (list) {
      listAPI = yield quest.createPlugin('list', {
        desktopId,
        clientSessionId,
        table: list,
        options: {
          type,
          field: 'description',
          sort: {
            key: 'info.keyword',
            dir: 'asc',
          },
        },
      });
    }

    let hinter;
    let hinterId;
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

          hinterId = `${hName}-hinter@${quest.goblin.id}`;

          if (listAPI) {
            quest.goblin.defer(
              quest.sub(`${listAPI.id}.<content-index-changed>`, function* (
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

    quest.do({hinter, hinterId});
  });

  Goblin.registerQuest(goblinName, 'drill-down', function (
    quest,
    entityIds,
    view
  ) {
    quest.evt('<drill-down-requested>', {
      entityIds,
      view,
      desktopId: quest.goblin.getX('desktopId'),
    });
  });

  common.registerHinters(goblinName, hinters);

  Goblin.registerQuest(goblinName, 'get-entity', common.getEntityQuest);

  Goblin.registerQuest(goblinName, 'load-entity', common.loadEntityQuest);

  Goblin.registerQuest(goblinName, 'sort-list', function* (quest, key, dir) {
    key = key.replace(/\./g, '/');

    //HACK: mapped to info index
    if (key === 'meta/summaries/info' || key === 'meta/summaries/description') {
      key = 'info.keyword';
    }

    const listAPI = quest.getAPI(`list@${quest.goblin.id}`);
    yield listAPI.setSort({
      key,
      dir,
    });
  });

  Goblin.registerQuest(goblinName, 'open-entity-workitem', function* (
    quest,
    entityId,
    entity,
    desktopId,
    currentLocation,
    navigate = true
  ) {
    const desk = quest.getAPI(desktopId);
    let entityType = null;
    if (entity) {
      entityType = entity.get('meta.type');
      entityId = entity.get('id');
    } else {
      entityType = entityId.split('@')[0];
    }
    let workitemName = `${entityType}-workitem`;
    if (workitems && workitems[entityType]) {
      workitemName = workitems[entityType];
    }

    yield desk.addWorkitem({
      workitem: {
        id: quest.uuidV4(),
        name: workitemName,
        view: 'default',
        icon: 'solid/pencil',
        kind: 'tab',
        isClosable: true,
        payload: {
          entityId,
        },
      },
      navigate: navigate,
      currentLocation: navigate ? currentLocation : null,
    });
  });

  Goblin.registerQuest(goblinName, 'delete', function (quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
