const MarkdownBuilder = require('./markdown-builder.js');
const checkEntity = require('./middlewares/checkEntity.js');
const Shredder = require('xcraft-core-shredder');

/******************************************************************************/

const MD = new MarkdownBuilder();

function* addEntityNotification(quest, message, isWarning) {
  const desktopId = quest.getDesktop();

  if (isWarning) {
    quest.log.warn(message);
  } else {
    quest.log.err(message);
  }

  // If the code is running in the backend, generates a simple log. One day, it
  // would be good to bring this up in the frontend to display a real notification.
  if (desktopId.startsWith('system@')) {
    return;
  }
  const desktop = quest.getAPI(desktopId).noThrow();

  let glyph = 'solid/bug';
  if (isWarning) {
    glyph = 'solid/exclamation-triangle';
  }

  yield desktop.addNotification({
    notificationId: `notification@${quest.uuidV4()}`,
    glyph,
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
  pushRow(rows, 'From', fix.from);
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

function* checkProperty(quest, from, entityName, propName, propInfo, newValue) {
  if (propInfo) {
    if (propInfo.type) {
      const fix = yield* checkEntity.checkProperty(
        quest,
        quest.goblin.id,
        from,
        propName,
        propInfo,
        newValue
      );
      if (fix) {
        fix.entityName = entityName;
        yield* addFixNotification(quest, fix);
        return false; // error
      } else {
        return true; // ok
      }
    } else {
      const fix = {
        entityName: entityName,
        entityId: quest.goblin.id,
        path: propName,
        value: newValue,
        valueType: typeof newValue,
        message:
          'Not declared correctly in entity properties: Missing type info',
      };
      yield* addFixNotification(quest, fix);
      return false; // error
    }
  } else {
    const fix = {
      entityName: entityName,
      entityId: quest.goblin.id,
      path: propName,
      value: newValue,
      valueType: typeof newValue,
      message: 'Not declared in entity properties',
    };
    yield* addFixNotification(quest, fix);
    return false; // error
  }
}

/******************************************************************************/

function completesEntityWithDefaultValues(entityName, entity) {
  return checkEntity.completesEntityWithDefaultValues(entityName, entity);
}

/******************************************************************************/

function* checkNewEntity(quest, from, entityName, entity) {
  const data = [];
  const reporter = (params) => {
    data.push(params);
  };

  yield* checkEntity.checkEntity(quest, entity, from, reporter, null, [
    'check-value-fields',
    'check-missing-fields',
    'check-undefined-schema-fields',
    'check-skip-meta',
    'check-skip-sums',
  ]);

  if (data.length > 0) {
    for (const item of data) {
      const fix = {
        entityName: entityName,
        entityId: quest.goblin.id,
        path: item.path,
        value: item.value,
        valueType: item.valueType,
        message: item.message,
      };
      yield* addFixNotification(quest, fix);
    }

    const message = `The entity '${entityName}' is inconsistent. The ${data.length} notifications below explain the issues.`;
    yield* addEntityNotification(quest, message);

    return false; // error
  }

  return true; // ok
}

/******************************************************************************/

function* checkSummaries(quest, from, entityName, summaries) {
  const entity = {
    id: entityName,
    meta: {summaries},
  };

  const data = [];
  const reporter = (params) => {
    data.push(params);
  };

  yield* checkEntity.checkEntity(quest, entity, from, reporter, null, [
    'check-only-meta',
  ]);

  if (data.length > 0) {
    for (const item of data) {
      const fix = {
        entityName: entityName,
        entityId: quest.goblin.id,
        path: item.path,
        value: item.value,
        valueType: item.valueType,
        message: item.message,
      };
      yield* addFixNotification(quest, fix);
    }

    const message = `The entity '${entityName}' has inconsistent 'meta.summaries'. The ${data.length} notifications below explain the issues.`;
    yield* addEntityNotification(quest, message);

    return false; // error
  }

  return true; // ok
}

/******************************************************************************/

function* checkSums(quest, from, entityName, sums) {
  const entity = {
    id: entityName,
    sums,
  };

  const data = [];
  const reporter = (params) => {
    data.push(params);
  };

  yield* checkEntity.checkEntity(quest, entity, from, reporter, null, [
    'check-only-sums',
  ]);

  if (data.length > 0) {
    for (const item of data) {
      const fix = {
        entityName: entityName,
        entityId: quest.goblin.id,
        path: item.path,
        value: item.value,
        valueType: item.valueType,
        message: item.message,
      };
      yield* addFixNotification(quest, fix);
    }

    const message = `The entity '${entityName}' has inconsistent 'sums'. The ${data.length} notifications below explain the issues.`;
    yield* addEntityNotification(quest, message);

    return false; // error
  }

  return true; // ok
}

// Check full propName first, if there is a property defined for something like "info.status"
// Else check if there is a definition for first portion of path "info"
function getPropertyInfo(properties, propName) {
  return properties[propName] || properties[Shredder._toPath(propName)[0]];
}

/******************************************************************************/

module.exports = {
  addEntityNotification,
  addFixNotification,
  checkProperty,
  completesEntityWithDefaultValues,
  checkNewEntity,
  checkSummaries,
  checkSums,
  getPropertyInfo,
};
