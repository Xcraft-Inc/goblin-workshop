function capitalize(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

module.exports = config => {
  const widgetName = capitalize(config.type);
  return `
import React from 'react';
import * as Bool from 'gadgets/helpers/bool-helpers';
import Widget from 'goblin-laboratory/widgets/widget';
import Table from 'goblin-gadgets/widgets/table/widget';
import Container from 'goblin-gadgets/widgets/container/widget';

/******************************************************************************/

class Plugin${widgetName} extends Widget {
  constructor() {
    super(...arguments);
  }

  static get wiring() {
    return {
      id: 'id',
    };
  }

  pushRow(rows, entityId, index) {
    //TODO
  }

  buildTable(entityIds) {
    const dataTable = {
      header:${JSON.stringify(
        Object.keys(config.properties).map(key => {
          return {name: key, description: key, texAlign: 'left'};
        })
      )},
      rows: [],
    };

    let index = 0;
    for (const entityId of entityIds) {
      this.pushRow(dataTable.rows, entityId, index++);
    }

    return dataTable;
  }

  /******************************************************************************/

  render() {
    if (!this.props.id || !this.props.entityIds || !this.props.loaded) {
      return <Container busy={true} height="200px" />;
    }

    const entityIds = this.props.entityIds.toArray();
    if (entityIds.length === 0) {
      return null;
    }

    if (
      entityIds.length === 0 &&
      Bool.isTrue(this.props.readonly) &&
      Bool.isTrue(this.props.embedded)
    ) {
      return null;
    }

    return (
      <Table
        grow="1"
        data={this.buildTable(entityIds)}
        headerWithoutHorizontalSeparator={true}
      />
    );
  }
}

/******************************************************************************/

function collectionLoaded(state, ids, entityCheck) {
  const entities = ids.map(id => state.get("backend." + id));
  return !entities.some(
    entity =>
      !entity || !entity.get('meta') || (entityCheck && !entityCheck(entity))
  );
}

export default Widget.connect((state, props) => {
  if (!state) {
    return {};
  }
  const loaded =
    props.entityIds &&
    collectionLoaded(state, props.entityIds, option =>
      collectionLoaded(state, option.get('${widgetName}'))
    );
  return {
    loaded,
  };
})(Plugin${widgetName});`;
};
