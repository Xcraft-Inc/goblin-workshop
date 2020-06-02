const MarkdownBuilder = require('./markdown-builder.js');
const checkEntity = require('./middlewares/checkEntity.js');

/******************************************************************************/

const MD = new MarkdownBuilder();

function* addEntityNotification(quest, message) {
  const desktopId = quest.getDesktop();
  if (desktopId.startsWith('system@')) {
    // If the code is running in the backend, generates a simple log. One day, it
    // would be good to bring this up in the frontend to display a real notification.
    quest.log.err(message);
    return;
  }
  const desktop = quest.getAPI(desktopId).noThrow();

  yield desktop.addNotification({
    notificationId: `notification@${quest.uuidV4()}`,
    glyph: 'solid/bug',
    color: 'red',
    message,
  });
}

function pushRow(rows, label, value) {
  if (value) {
    const row = MD.join([label, MD.italic(value)], ': ');
    rows.push(row);
  }
}

function* addFixNotification(quest, fix) {
  const rows = [];
  pushRow(rows, 'Entity', fix.entityName);
  pushRow(rows, 'Property', fix.path);
  pushRow(rows, 'PropertyType', fix.pathType);
  pushRow(rows, 'NewValue', fix.value);
  pushRow(rows, 'NewValueType', fix.valueType);
  pushRow(rows, 'Message', fix.message);
  rows.push(MD.bold('Data has not been persisted'));

  MD.flush();
  MD.addTitle(MD.bold('DATA DOES NOT MATCH THE SCHEMA'));
  MD.addUnorderedList(rows);
  const message = MD.toString();

  yield* addEntityNotification(quest, message);
}

/******************************************************************************/

function* checkProperty(quest, goblinName, propName, propInfo, newValue) {
  if (propInfo) {
    if (propInfo.type) {
      const fix = checkEntity.checkProperty(
        quest.goblin.id,
        propName,
        propInfo,
        newValue
      );
      if (fix) {
        fix.entityName = goblinName;
        yield* addFixNotification(quest, fix);
        return false;
      } else {
        return true;
      }
    } else {
      const fix = {
        entityName: goblinName,
        entityId: quest.goblin.id,
        path: propName,
        value: newValue,
        valueType: typeof newValue,
        message:
          'Not declared correctly in entity properties: Missing type info',
      };
      yield* addFixNotification(quest, fix);
      return false;
    }
  } else {
    const fix = {
      entityName: goblinName,
      entityId: quest.goblin.id,
      path: propName,
      value: newValue,
      valueType: typeof newValue,
      message: 'Not declared in entity properties',
    };
    yield* addFixNotification(quest, fix);
    return false;
  }
}

/******************************************************************************/

function completesEntityWithDefaultValues(goblinName, entity) {
  checkEntity.completesEntityWithDefaultValues(goblinName, entity);
}

/******************************************************************************/

function* checkNewEntity(quest, goblinName, entity) {
  const data = [];
  const reporter = (params) => {
    data.push(params);
  };

  checkEntity.checkEntity(entity, reporter, null, [
    'check-value-fields',
    'check-missing-fields',
    'check-undefined-schema-fields',
    'check-skip-meta',
    'check-skip-sums',
  ]);

  if (data.length > 0) {
    const message = `The newly created entity '${goblinName}' is inconsistent. The ${data.length} notifications below explain the issues.`;
    yield* addEntityNotification(quest, message);

    for (const item of data) {
      const fix = {
        entityName: goblinName,
        entityId: quest.goblin.id,
        path: item.path,
        value: item.value,
        valueType: item.valueType,
        message: item.message,
      };
      yield* addFixNotification(quest, fix);
    }
    return false;
  }

  return true;
}

/******************************************************************************/

module.exports = {
  addEntityNotification,
  checkProperty,
  completesEntityWithDefaultValues,
  checkNewEntity,
};
