'use strict';

module.exports = {
  'clear': (state) => {
    return state.set('entityIds', []).set('extendedId', null);
  },
  'extend': (state, action) => {
    const entityId = action.get('entityId');

    const extendedIds = state.get('extendedIds').toArray();
    if (extendedIds.indexOf(entityId) !== -1) {
      return state;
    }

    state = state.push('extendedIds', entityId);

    const currentId = state.get('extendedId');
    if (entityId === currentId) {
      return state.set('extendedId', null); // compact panel
    } else {
      return state.set('extendedId', entityId); // extend panel
    }
  },
  'collapse': (state, action) => {
    const entityId = action.get('entityId');

    const extendedIds = state.get('extendedIds').toArray();
    if (extendedIds.indexOf(entityId) === -1) {
      return state;
    }

    state = state.unpush('extendedIds', entityId);

    const currentId = state.get('extendedId');
    if (entityId === currentId) {
      return state.set('extendedId', null); // compact panel
    } else {
      return state.set('extendedId', entityId); // extend panel
    }
  },
  'compact-all': (state) => {
    return state.set('extendedId', null); // compact all panels
  },
};
