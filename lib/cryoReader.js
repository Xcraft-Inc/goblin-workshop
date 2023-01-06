'use strict';

const watt = require('gigawatts');
const {SQLite} = require('xcraft-core-book');

class CryoReader extends SQLite {
  constructor(location, db) {
    super(location);

    this._queries = {};
    this._dbName = db;

    this._queries.getActionState = `
      SELECT json_extract(action, '$.payload.state') as action
      FROM actions
      WHERE goblin = $goblin
      ORDER BY timestamp DESC
      LIMIT 1;
    `;

    watt.wrapAll(this);
  }

  _open(dbName, resp) {
    const res = super.open(dbName, '', this._queries);
    if (!res) {
      resp.log.warn('something wrong happens with SQLite');
    }
    return res;
  }

  getActionState(quest, goblinId) {
    if (!this.tryToUse(quest)) {
      return null;
    }

    if (!this._open(this._dbName, quest)) {
      return;
    }

    return this.stmts(this._dbName).getActionState.get({
      goblin: `${goblinId.split('@', 1)[0]}-${goblinId}`,
    });
  }
}

module.exports = CryoReader;
