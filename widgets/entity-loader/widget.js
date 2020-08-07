import React from 'react';
import Widget from 'goblin-laboratory/widgets/widget';

class _EntityRenderer extends Widget {
  constructor() {
    super(...arguments);
    this.renewTTL = this.renewTTL.bind(this);
    this.onDrillDown = this.onDrillDown.bind(this);
    this._idRequested = null;
    this._renewInterval = null;
  }

  onDrillDown() {
    this.cmd('entity-driller.drill-down', {
      id: 'entity-driller',
      entityIds: [this.props.entityId],
      view: this.props.view,
      desktopId: this.context.desktopId,
    });
  }

  renewTTL(id) {
    if (this._renewInterval) {
      clearInterval(this._renewInterval);
    }
    this._renewInterval = setInterval(this.props.onDrillDown, 15000, id);
  }

  componentWillUnmount() {
    super.componentWillUnmount();
    clearInterval(this._renewInterval);
  }

  render() {
    const {entityId, entity, renderer} = this.props;
    const id = entityId;
    if (this._idRequested !== id) {
      setTimeout(this.onDrillDown, 0, id);
      this.renewTTL(id);
      this._idRequested = id;
    }
    if (!entity) {
      return null;
    }
    return renderer(entity);
  }
}

export default Widget.connect((state, props) => {
  return {entity: state.get(`backend.${props.entityId}`)};
})(_EntityRenderer);
