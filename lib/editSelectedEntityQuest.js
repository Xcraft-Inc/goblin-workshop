module.exports = (workitemName) =>
  function* (quest, selection, currentLocation) {
    const desk = quest.getAPI(quest.goblin.getX('desktopId'));
    const entity = yield quest.me.getEntity({
      entityId: selection.value,
      privateState: true,
    });
    yield desk.addWorkitem({
      workitem: {
        id: quest.uuidV4(),
        name: workitemName,
        description: entity.get('meta.summaries.info'),
        view: 'default',
        kind: 'tab',
        icon: 'solid/pencil',
        isClosable: true,
        payload: {
          entityId: selection.value,
          entity: entity,
        },
      },
      navigate: true,
      currentLocation,
    });
  };
