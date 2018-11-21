const Goblin = require('xcraft-core-goblin');

module.exports = config => {
  const {type, kind, columns} = config;

  const goblinName = `${type}-${kind}`;

  const logicHandlers = {
    create: (state, action) => {
      const config = {
        id: action.get('id'),
        type,
        columns: action.get('columns'),
      };
      return state.set('', config);
    },
  };

  Goblin.registerQuest(goblinName, 'create', function*(quest, desktopId) {
    quest.goblin.setX('desktopId', desktopId);

    yield quest.createPlugin('list', {
      desktopId,
      table: type,
      contentIndex: {name: 'id'},
    });

    quest.do({columns});
  });

  Goblin.registerQuest(goblinName, 'drill-down', function*(
    quest,
    entityIds,
    next
  ) {
    entityIds.forEach(entityId =>
      quest.createFor(
        'list.drill-down',
        'none',
        entityId,
        {
          id: entityId,
          mustExist: true,
          desktopId: quest.goblin.getX('desktopId'),
          _goblinTTL: 5000,
        },
        next.parallel()
      )
    );
    yield next.sync();
  });

  Goblin.registerQuest(goblinName, 'delete', function(quest) {});

  return Goblin.configure(goblinName, {}, logicHandlers);
};
