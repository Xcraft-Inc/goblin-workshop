// create a unique, global symbol name
// -----------------------------------
const BATCH_DRILLER_KEY = Symbol.for('goblin-workshop.batch-driller');
import throttle from 'lodash/throttle';

class BatchDriller {
  constructor() {
    this._requests = {};
    this._drillDown = throttle(this._drillDownInternal, 2000);
  }

  _drillDownInternal(callerWidget) {
    for (const [k, v] of Object.entries(this._requests)) {
      if (v.entityIds.length > 0) {
        callerWidget.cmd('entity-driller.drill-down', {
          id: 'entity-driller',
          entityIds: v.entityIds,
          view: v.view,
          desktopId: callerWidget.context.desktopId,
          ttl: 600000,
        });
        this._requests[k].entityIds = [];
      }
    }
  }

  drillDown(callerWidget, entityId, path, view) {
    const type = entityId.split('@')[0];
    const key = `${type}@${path}`;
    if (!this._requests[key]) {
      this._requests[key] = {view, entityIds: []};
    }
    this._requests[key].entityIds.push(entityId);
    this._drillDown(callerWidget);
  }
}

// check if the global object has this symbol
// add it if it does not have the symbol, yet
// ------------------------------------------
const globalSymbols = Object.getOwnPropertySymbols(global);
const hasBatchDriller = globalSymbols.indexOf(BATCH_DRILLER_KEY) > -1;
if (!hasBatchDriller) {
  global[BATCH_DRILLER_KEY] = new BatchDriller();
}

// define the singleton API
// ------------------------

const singleton = {};

Object.defineProperty(singleton, 'instance', {
  get: function () {
    return global[BATCH_DRILLER_KEY];
  },
});

// ensure the API is never changed
// -------------------------------

Object.freeze(singleton);

// export the singleton API only
// -----------------------------
export default singleton;
