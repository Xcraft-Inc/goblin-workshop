const common = require('../workitems/common.js');

module.exports = {
  persist: state => state,
  create: (state, action) => {
    const id = action.get('id');
    return state.set('', action.get('entity')).set('id', id);
  },
  change: (state, action) => {
    return state.set(action.get('path'), action.get('newValue'));
  },
  apply: (state, action) => {
    return state.merge('', action.get('patch'));
  },
  preview: (state, action) => {
    return state.merge('', action.get('patch'));
  },
  replace: (state, action) => state.set('', action.get('entity')),
  'update-aggregate': (state, action) => {
    const entity = action.get('entity');
    const fullPath = entity.get('meta.rootAggregatePath').toArray();
    const parentPath = fullPath.slice(-3);
    return state.set(parentPath, entity);
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
  backup: (state, action) => {
    const entity = action.get('entity');
    return state.set('private.backup', entity);
  },
  restore: state => {
    const backup = state.get('private.backup', null);
    return backup.set('private.backup', backup);
  },
  publish: state => {
    return state.set('meta.status', 'published');
  },
  archive: state => {
    return state.set('meta.status', 'archived');
  },
  'build-summaries': (state, action) => {
    const summaries = action.get('summaries');
    return state.set('meta.summaries', summaries);
  },
  index: (state, action) => {
    return state.set('meta.index', action.get('document'));
  },
  compute: (state, action) => {
    const sums = action.get('sums');
    let stateSums = {};
    Object.keys(sums).forEach(sum => {
      if (!common.isFunction(sums[sum])) {
        stateSums[sum] = sums[sum].toString();
      }
    });
    return state.set('sums', stateSums);
  },
  version: (state, action) => {
    let version = state.get('meta.version');
    version++;
    return state
      .set('meta.createdAt', new Date().getTime())
      .set('meta.version', version);
  },
  'load-version': (state, action) => {
    const backup = state.get('private.backup', null);
    state = state.del('versions');
    if (backup) {
      state = state.merge('', action.get('version'));
      state = state.set('private.backup', backup.toJS());
      return state;
    } else {
      return state.set('', action.get('version'));
    }
  },
};
