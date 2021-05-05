const watt = require('gigawatts');

class AggregateBuilder {
  /**
   * Apply changes to entity aggregations
   * @constructor
   * @param {Object} quest - current quest context
   * @param {string} entityId - current entity to edit
   * @returns {Object} the builder instance
   */
  constructor(quest, entityId) {
    this._quest = quest;
    this._changes = [];
    this._current = entityId;
    watt.wrapAll(this);
    return this;
  }

  _push(change) {
    this._changes.push(change);
  }

  /**
   * Define another entity to change
   * @param {string} entityId - entity to edit
   * @returns {Object} the builder instance
   */
  edit(entityId) {
    if (entityId && entityId !== this._current) {
      this._current = entityId;
    }
    return this;
  }

  /**
   * Apply changes to entity aggregations
   * @param {Object} patch - your patch {property: value}
   * @returns {Object} the builder instance
   */
  patch(patch) {
    this._push({
      edit: this._current,
      action: 'patch',
      payload: patch,
    });
    return this;
  }

  /**
   * Add reference or new value to the collection
   * @param {string} collection - property name
   * @param {string | Object} refOrPayload - entityId or new entity payload
   * @returns {Object} the builder instance
   */
  add(collection, refOrPayload) {
    if (typeof refOrPayload === 'string') {
      this._push({
        edit: this._current,
        action: 'add',
        path: collection,
        entityId: refOrPayload,
      });
    } else {
      this._push({
        edit: this._current,
        action: 'add',
        path: collection,
        payload: refOrPayload,
      });
    }
    return this;
  }

  /**
   * Remove reference or value from the collection
   * @param {string} collection - property name
   * @param {string | Object} entityId - entityId to remove
   * @returns {Object} the builder instance
   */
  remove(collection, entityId) {
    this._push({
      edit: this._current,
      action: 'remove',
      path: collection,
      entityId,
    });
    return this;
  }

  /**
   * Clear the collection
   * @param {string} collection - property name
   * @returns {Object} the builder instance
   */
  clear(collection) {
    this._push({
      edit: this._current,
      action: 'clear',
      path: collection,
    });
    return this;
  }

  /**
   * Apply and reset the changes
   * @param {string=} desktopId - optional desktopId
   */
  *apply(desktopId) {
    const aggAPI = this._quest.getAPI('aggregate-updater');
    yield aggAPI.applyChanges({
      desktopId: desktopId || this._quest.getDesktop(),
      changes: this._changes,
    });
    this._changes = [];
  }
}

module.exports = AggregateBuilder;
