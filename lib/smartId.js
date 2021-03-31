const watt = require('gigawatts');

class SmartId {
  constructor(id, expectedType) {
    this.parts = id.split('@');
    this.id = id;
    this.type = this.parts[0];
    this.uid = this.parts[1];
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
