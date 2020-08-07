import React from 'react';
import Widget from 'goblin-laboratory/widgets/widget';
import batchDriller from 'goblin-workshop/widgets/batch-driller/instance.js';
class _LinkRenderer extends Widget {
  constructor() {
    super(...arguments);
    this.renewTTL = this.renewTTL.bind(this);
    this._idRequested = null;
    this._renewInterval = null;
  }

  renewTTL(id) {
    if (this._renewInterval) {
      clearInterval(this._renewInterval);
    }
    this._renewInterval = setInterval(
      this.props.onDrillDown,
      500000,
      id,
      '*',
      null
    );
  }

  componentWillUnmount() {
    super.componentWillUnmount();
    clearInterval(this._renewInterval);
  }

  render() {
    const {entityId, entity, onDrillDown, renderer} = this.props;
    const id = entityId;
    if (this._idRequested !== id) {
      setTimeout(onDrillDown, 0, id, '*', null);
      this.renewTTL(id);
      this._idRequested = id;
    }
    if (!entity) {
      return null;
    }
    return renderer(entity);
  }
}

const LinkRenderer = Widget.connect((state, props) => {
  return {entity: state.get(`backend.${props.entityId}`)};
})(_LinkRenderer);

class _LinkLoader extends Widget {
  constructor() {
    super(...arguments);
    this.renewTTL = this.renewTTL.bind(this);
    this._idRequested = null;
    this._renewInterval = null;
    this.view = null;
  }

  renewTTL(id, path) {
    if (this._renewInterval) {
      clearInterval(this._renewInterval);
    }
    this._renewInterval = setInterval(
      this.props.onDrillDown,
      500000,
      id,
      path,
      this.view
    );
  }

  componentWillUnmount() {
    super.componentWillUnmount();
    clearInterval(this._renewInterval);
  }

  render() {
    const {mustLoad, onDrillDown, entityId, level, path} = this.props;
    if (mustLoad) {
      const id = entityId;
      if (!this.view) {
        const parts = path.split('/');
        const nextPart = parts[level + 1];
        if (!nextPart) {
          return null;
        } else {
          const subParts = nextPart.split('.');
          if (subParts.length > 1) {
            this.view = [
              subParts.reduceRight((obj, part) => {
                const newObj = {};
                newObj[part] = !obj ? true : Object.assign({}, obj);
                return newObj;
              }, null),
            ];
          } else {
            this.view = [nextPart];
          }
        }
      }

      if (this._idRequested !== id) {
        setTimeout(onDrillDown, 0, id, path, this.view);
        this.renewTTL(id, path);
        this._idRequested = id;
      }
      return (
        <LinkLoader
          onDrillDown={onDrillDown}
          entityId={entityId}
          level={level + 1}
          path={path}
          renderer={this.props.renderer}
        />
      );
    } else {
      return (
        <React.Fragment>
          {this.props.values.map((id, i) => {
            return (
              <LinkRenderer
                key={i}
                linkId={path}
                entityId={id}
                renderer={this.props.renderer}
                onDrillDown={onDrillDown}
              />
            );
          })}
        </React.Fragment>
      );
    }
  }
}

const LinkLoader = Widget.connect((state, props) => {
  const part = props.path.split('/')[props.level];
  let dataPath;
  if (props.level === 0) {
    dataPath = props.entityId;
  } else {
    dataPath = `entity-view@${props.entityId}`;
  }
  // console.log(`targeting: ${dataPath}.${part}`);
  const target = state.get(`backend.${dataPath}.${part}`);
  if (!target) {
    // console.log(`Load lvl ${props.level} with part ${part}`);
    return {mustLoad: true, entityId: props.entityId};
  }
  if (typeof target === 'string') {
    // console.log(`Load lvl ${props.level} with part ${part} -> ${target}`);
    return {mustLoad: true, entityId: target};
  } else {
    // console.log(`Display lvl ${props.level} with part ${part}`);
    return {mustLoad: false, values: target};
  }
})(_LinkLoader);

class LinksLoader extends Widget {
  constructor() {
    super(...arguments);
    this.onDrillDown = this.onDrillDown.bind(this);
  }

  onDrillDown(...args) {
    batchDriller.instance.drillDown(this, ...args);
  }

  render() {
    if (!this.props.link) {
      return null;
    }
    return (
      <React.Fragment>
        {this.props.link.get('paths').map((path, i) => {
          return (
            <LinkLoader
              key={i}
              onDrillDown={this.onDrillDown}
              entityId={this.props.entityId}
              level={0}
              path={path}
              renderer={this.props.renderer}
            />
          );
        })}
      </React.Fragment>
    );
  }
}

export default Widget.connect((state, props) => {
  const link = state.get(`backend.${props.entityId}.meta.links.${props.load}`);
  return {link};
})(LinksLoader);
