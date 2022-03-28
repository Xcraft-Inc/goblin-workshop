const watt = require('gigawatts');
const Goblin = require('xcraft-core-goblin');

class SmartId extends Goblin.SmartId {
  constructor(id, expectedType) {
    super(id, expectedType);
    watt.wrapAll(this);
    return this;
  }

  *exist(quest) {
    const r = quest.getStorage('rethink');
    return yield r.exist({table: this.type, documentId: this.id});
  }
}

module.exports = SmartId;
