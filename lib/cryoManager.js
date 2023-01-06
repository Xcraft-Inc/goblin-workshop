'use strict';

const CryoReader = require('./cryoReader.js');

class CryoManager {
  constructor() {
    this._readers = {};
  }

  async #tryCryo(quest) {
    const cryo = quest.getAPI('cryo');
    const location = await cryo.getLocation();
    return new CryoReader(location, quest.getSession());
  }

  async reader(quest) {
    const db = quest.getSession();
    if (!this._readers[db]) {
      this._readers[db] = await this.#tryCryo(quest);
    }
    return this._readers[db];
  }

  async get(quest, documentId) {
    const reader = await this.reader(quest);
    return reader ? reader.getActionState(quest, documentId) : null;
  }
}

module.exports = new CryoManager();
