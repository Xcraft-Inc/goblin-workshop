class AlertsBuilder {
  /**
   * Define and create business alerts
   * @constructor
   * @returns {Object} the builder instance
   */
  constructor() {
    this.warnings = {};
    this.errors = {};
    this._errorsTemplate = {};
    this._warningsTemplate = {};
    this.hasErrors = false;
    this.hasWarnings = false;
    this.validTypes = ['error', 'warning'];
    return this;
  }

  /**
   * Define a new error alert
   * @param {string} id - warning identifier
   * @param {string | Object} message - error message
   * @param {string | Object} priority - error priority low 0
   * @returns {Object} the builder instance
   */
  defineError(id, message = '', priority = 0) {
    this._errorsTemplate[id] = {
      id,
      type: 'error',
      message,
      count: 1,
      priority,
    };
    return this;
  }

  /**
   * Define a new warning alert
   * @param {string} id - error identifier
   * @param {string | Object} message - warning message
   * @param {string | Object} priority - error priority low 0
   * @returns {Object} the builder instance
   */
  defineWarning(id, message = '', priority = 0) {
    this._warningsTemplate[id] = {
      id,
      type: 'warning',
      message,
      count: 1,
      priority,
    };
    return this;
  }

  hash(message) {
    //https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
    let hash = 0;
    if (message.length === 0) {
      return hash;
    }
    let chr;
    for (let i = 0; i < message.length; i++) {
      chr = message.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    return hash;
  }

  /**
   * Add dedicated error to the stack
   * TODO: handle T()
   * @param {string} type - error/warning
   * @param {string} message - message
   * @param {string | Object} priority - error priority low 0
   * @returns {Object} the builder instance
   */
  add(type, message, priority = 0) {
    if (!this.validTypes.includes(type)) {
      throw new Error(`AlertsBuilder.add: unknow type ${type}`);
    }
    const id = `${type}@${this.hash(message)}`;
    const collection = type === 'error' ? this.errors : this.warnings;
    if (collection[id]) {
      collection[id].count++;
    } else {
      collection[id] = {
        id,
        type,
        message,
        count: 1,
        priority,
      };
    }

    return this;
  }

  /**
   * Add error
   * @param {string} id - error identifier
   * @returns {Object} the builder instance
   */
  addError(id) {
    if (!this.errors[id]) {
      if (!this._errorsTemplate[id]) {
        throw new Error(`AlertsBuilder: unknow error identifier ${id}`);
      }
      this.errors[id] = this._errorsTemplate[id];
      this.hasErrors = true;
    } else {
      this.errors[id].count++;
    }
    return this;
  }

  /**
   * Add error
   * @param {string} id - error identifier
   * @returns {Object} the builder instance
   */
  addWarning(id) {
    if (!this.warnings[id]) {
      if (!this._warningsTemplate[id]) {
        throw new Error(`AlertsBuilder: unknow warning identifier ${id}`);
      }
      this.warnings[id] = this._warningsTemplate[id];
      this.hasWarnings = true;
    } else {
      this.warnings[id].count++;
    }
    return this;
  }

  /**
   * Build alerts
   * @returns {Object} builded alerts
   */
  build() {
    const stack = [
      ...Object.values(this.errors)
        .sort((a, b) => a.priority - b.priority)
        .reverse(),
      ...Object.values(this.warnings)
        .sort((a, b) => a.priority - b.priority)
        .reverse(),
    ];
    return {
      hasErrors: this.hasErrors,
      hasWarnings: this.hasWarnings,
      stack,
    };
  }
}

module.exports = AlertsBuilder;
