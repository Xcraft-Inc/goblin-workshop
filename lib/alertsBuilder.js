class AlertsBuilder {
  /**
   * Define and create business alerts (error, warning, info)
   * @constructor
   * @returns {Object} the builder instance
   */
  constructor() {
    this.alerts = [];
    this.groups = {};
    this.hasErrors = false;
    this.hasWarnings = false;
    this.validTypes = ['info', 'error', 'warning'];
    return this;
  }

  /**
   * Add dedicated error to the stack
   * @param {string} type - error/warning
   * @param {string | Object} message - message or T()
   * @param {string} groupId - groupId
   * @param {number} priority - error priority low 0
   * @returns {Object} the builder instance
   */
  add(type, message, groupId = null, priority = 0) {
    if (!this.validTypes.includes(type)) {
      throw new Error(`AlertsBuilder.add: unknow type ${type}`);
    }
    this.alerts.push({type, groupId, message, priority});
    return this;
  }

  /**
   * Add group
   * @param {string} groupId - groupId
   * @param {string | Object} title - group title or T()
   * @returns {Object} the builder instance
   */
  addGroup(groupId, title) {
    this.groups[groupId] = title;
    return this;
  }

  /**
   * Add error
   * @param {string | Object} message - message or T()
   * @param {string} groupId - groupId
   * @param {number} priority - error priority low 0
   * @returns {Object} the builder instance
   */
  addError(message, groupId = null, priority = 0) {
    this.add('error', message, groupId, priority);
    this.hasErrors = true;
    return this;
  }

  /**
   * Add warning
   * @param {string | Object} message - message or T()
   * @param {string} groupId - groupId
   * @param {number} priority - error priority low 0
   * @returns {Object} the builder instance
   */
  addWarning(message, groupId, priority = 0) {
    this.add('warning', message, groupId, priority);
    this.hasWarnings = true;
    return this;
  }

  /**
   * Add info
   * @param {string | Object} message - message or T()
   * @param {string} groupId - groupId
   * @param {number} priority - error priority low 0
   * @returns {Object} the builder instance
   */
  addInfo(message, groupId, priority = 0) {
    this.add('info', message, groupId, priority);
    return this;
  }

  /**
   * Build alerts
   * @returns {Object} builded alerts
   */
  build() {
    const x = [
      {
        groupId: 'position0',
        max: 10,
        alerts: [],
      },
    ];

    const groupedAlerts = this.alerts.reduce((stack, alert) => {
      const groupId = alert.groupId || 'global';

      if (!stack[groupId]) {
        stack[groupId] = {
          title: this.groups[groupId],
          groupId,
          max: alert.priority,
          alerts: {error: [], warning: [], info: []},
        };
        stack[groupId].alerts[alert.type].push(alert);
      } else {
        if (alert.priority > stack[groupId].max) {
          stack[groupId].max = alert.priority;
        }
        stack[groupId].alerts[alert.type].push(alert);
      }
      return stack;
    }, {});

    const stack = Object.values(groupedAlerts)
      .sort((g1, g2) => {
        return g1.max - g2.max;
      })
      .reverse()
      .map((group) => {
        group.alerts = [
          ...group.alerts.error.sort((a, b) => a - b).reverse(),
          ...group.alerts.warning.sort((a, b) => a - b).reverse(),
          ...group.alerts.info.sort((a, b) => a - b).reverse(),
        ];
        return group;
      });

    return {
      hasErrors: this.hasErrors,
      hasWarnings: this.hasWarnings,
      stack,
    };
  }
}

module.exports = AlertsBuilder;
