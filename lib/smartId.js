const watt = require('gigawatts');

class SmartId {
  constructor(id, expectedType) {
    const [_, type, uid] = id.match(/^([^@]*)@?(.*)$/);
    this.id = id;
    this.type = type;
    this.uid = uid;
    this.expectedType = expectedType;
    watt.wrapAll(this);
    return this;
  }

  isMalformed() {
    return this.isValid() === false;
  }

  isValid() {
    if (this.expectedType === '*') {
      return this.hasUid();
    }
    return this.type === this.expectedType && this.hasUid();
  }

  hasUid() {
    if (!this.uid) {
      return false;
    }
    return true;
  }

  *exist(quest) {
    const r = quest.getStorage('rethink');
    return yield r.exist({table: this.type, documentId: this.id});
  }
}

module.exports = SmartId;
