const common = require('../workitems/common.js');

module.exports = {
  'persist': (state) => state,
  'create': (state, action) => {
    const id = action.get('id');
    const entity = action.get('entity');
    if (!entity) {
      throw new Error('Entity failed to be created, empty entity payload');
    }
    return state.set('', entity).set('id', id);
  },
  'change': (state, action) => {
    return state.set(action.get('path'), action.get('newValue'));
  },
  'apply': (state, action) => {
    return state.mergeDeep(action.get('path', ''), action.get('patch'));
  },
  'merge': (state, action) => {
    return state.merge(action.get('path', ''), action.get('patch'));
  },
  'preview': (state, action) => {
    return state.mergeDeep('', action.get('patch'));
  },
  'replace': (state, action) => state.set('', action.get('entity')),
  'update-aggregate': (state, action) => {
    const entity = action.get('entity');
    const entityPath = action.get('entityPath');
    return state.set(entityPath, entity);
  },
  'clear-ref': (state, action) => {
    return state.set(action.get('path'), action.get('value'));
  },
  'clear-val': (state, action) => {
    const path = action.get('path');
    const value = action.get('value');
    return state.set(path, value).set(`private.${path}`, {});
  },
  'set-ref': (state, action) => {
    return state.set(action.get('path'), action.get('entityId'));
  },
  'copy-collection-by-ref': (state, action) => {
    const path = action.get('path');
    const entityIds = action.get('entityIds');
    return state.set(path, entityIds);
  },
  'copy-collection-by-value': (state, action) => {
    const path = action.get('path');
    const entityIds = action.get('entityIds');
    const entities = action.get('entities');
    return state.set(path, entityIds).set(`private.${path}`, entities);
  },
  'add-ref': (state, action) => {
    const beforeId = action.get('beforeId');
    if (beforeId) {
      return state
        .push(action.get('path'), action.get('entityId'))
        .move(action.get('path'), action.get('entityId'), beforeId);
    } else {
      return state.push(action.get('path'), action.get('entityId'));
    }
  },
  'set-val': (state, action) => {
    const path = action.get('path');
    const entity = action.get('entity');
    const entityId = entity.get('id');
    return state.set(path, entityId).set(`private.${path}.${entityId}`, entity);
  },
  'add-val': (state, action) => {
    const path = action.get('path');
    const entity = action.get('entity');
    const beforeId = action.get('beforeId');
    const entityId = entity.get('id');
    if (beforeId) {
      return state
        .push(path, entityId)
        .move(path, entityId, beforeId)
        .set(`private.${path}.${entityId}`, entity);
    } else {
      return state
        .push(path, entityId)
        .set(`private.${path}.${entityId}`, entity);
    }
  },
  'move-ref': (state, action) => {
    return state.move(
      action.get('path'),
      action.get('entityId'),
      action.get('beforeEntityId')
    );
  },
  'move-val': (state, action) => {
    return state.move(
      action.get('path'),
      action.get('entityId'),
      action.get('beforeEntityId')
    );
  },
  'remove-val': (state, action) => {
    return state
      .unpush(action.get('path'), action.get('entityId'))
      .del(`private.${action.get('path')}.${action.get('entityId')}`);
  },
  'remove-ref': (state, action) => {
    return state.unpush(action.get('path'), action.get('entityId'));
  },
  '_rollback': (state, action) => {
    const id = state.get('id');
    const entity = action.get('entity');
    if (!entity) {
      throw new Error('Entity failed rollback, empty entity payload');
    }
    return state.set('', entity).set('id', id);
  },
  '_publish': (state) => {
    return state.set('meta.status', 'published');
  },
  '_archive': (state) => {
    return state.set('meta.status', 'archived');
  },
  '_trash': (state) => {
    return state.set('meta.status', 'trashed');
  },
  'build-summaries': (state, action) => {
    const summaries = action.get('summaries');
    return state.set('meta.summaries', summaries);
  },
  'build-views': (state, action) => {
    const views = action.get('views');
    return state.set('meta.views', views);
  },
  'build-props': (state, action) => {
    const props = action.get('props');
    return state.withMutations((s) => {
      for (const [propName, value] of Object.entries(props)) {
        s = s.set(propName, value);
      }
    });
  },
  'build-alerts': (state, action) => {
    const alerts = action.get('alerts');
    const hasErrors = alerts.hasErrors || false;
    const hasWarnings = alerts.hasWarnings || false;
    return state
      .set('meta.alerts', alerts.stack || [])
      .set('meta.hasErrors', hasErrors)
      .set('meta.hasWarnings', hasWarnings);
  },
  'index': (state, action) => {
    let doc = action.get('document');
    Object.entries(doc).reduce((doc, entry) => {
      if (entry[1] === undefined) {
        doc[entry[0]] = null;
      }
      return doc;
    }, doc);
    return state.set('meta.index', doc);
  },
  'compute': (state, action) => {
    const sums = action.get('sums');
    let stateSums = {};
    Object.keys(sums).forEach((sum) => {
      if (!common.isFunction(sums[sum])) {
        stateSums[sum] = sums[sum].toString();
      }
    });
    return state.set('sums', stateSums);
  },
  'version': (state, action) => {
    let version = state.get('meta.version');
    version++;
    return state
      .set('meta.createdAt', new Date().getTime())
      .set('meta.version', version);
  },
  'setUpdateInfos': (state, action) => {
    let version = state.get('meta.version');
    version++;
    return state
      .set('meta.updatedAt', new Date().getTime())
      .set('meta.updatedBy', action.get('user'))
      .set('meta.version', version);
  },
  'load-version': (state, action) => {
    const backup = state.get('private.backup', null);
    state = state.del('versions');
    if (backup) {
      state = state.mergeDeep('', action.get('version'));
      state = state.set('private.backup', backup.toJS());
      return state;
    } else {
      return state.set('', action.get('version'));
    }
  },
  'rollback-state': (state, action) => {
    return action.get('state');
  },
};
