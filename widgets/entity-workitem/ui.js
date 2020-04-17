import T from 't';
import React from 'react';
import Widget from 'goblin-laboratory/widgets/widget';
import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';

/******************************************************************************/

class EntityProps extends Widget {
  constructor() {
    super(...arguments);
  }

  render() {
    const {entity, schema} = this.props;

    return entity.map((v, k, index) => {
      if (k === 'id' || k === 'meta' || k === 'sums') {
        return null;
      }
      let type = 'default';
      const propInfo = schema.get(k);

      if (propInfo) {
        type = propInfo.get('type');
      } else {
        return null;
      }

      switch (type) {
        case 'bool':
        case 'date':
        case 'time':
        case 'datetime':
        case 'price':
        case 'weight':
        case 'length':
        case 'volume':
        case 'number':
        case 'percent':
        case 'delay':
          return (
            <Container key={index} kind="pane">
              <Field kind={type} labelText={k} model={`.${k}`} />
            </Container>
          );
        case 'enum':
          return (
            <Container key={index} kind="pane">
              <Field
                kind="combo"
                list={propInfo.get('values')}
                labelText={k}
                model={`.${k}`}
              />
            </Container>
          );
        default:
          return (
            <Container key={index} kind="pane">
              <Field labelText={k} model={`.${k}`} />
            </Container>
          );
      }
    });
  }
}

const EntityPropsWithSchema = Widget.connect((state, prop) => {
  const type = prop.entity.get('id').split('@')[0];
  const schema = state.get(`backend.entity-schema@${type}`);
  return {
    schema,
  };
})(EntityProps);

function renderPanel(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Field labelText="id" readonly={true} model=".id" />
      </Container>
      <EntityPropsWithSchema entity={props.entity} />
    </Container>
  );
}

function renderPlugin(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
        <Field labelText="id" readonly={true} model=".id" />
      </Container>
    </Container>
  );
}

/******************************************************************************/

function mapper(state) {
  return {
    entity: state,
  };
}

export default {
  mappers: {
    panel: {
      edit: mapper,
      readonly: mapper,
    },
    plugin: {
      edit: mapper,
      readonly: mapper,
    },
  },
  panel: {
    readonly: renderPanel,
    edit: renderPanel,
  },
  plugin: {
    readonly: {
      compact: renderPlugin,
      extend: renderPlugin,
    },
    edit: {
      compact: renderPlugin,
      extend: renderPlugin,
    },
  },
};
