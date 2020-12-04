import T from 't';
import React from 'react';
import Widget from 'goblin-laboratory/widgets/widget';
import Container from 'goblin-gadgets/widgets/container/widget.js';
import Field from 'goblin-gadgets/widgets/field/widget.js';
import Button from 'goblin-gadgets/widgets/button/widget.js';
import Label from 'goblin-gadgets/widgets/label/widget.js';
/******************************************************************************/

class EntityProps extends Widget {
  constructor() {
    super(...arguments);
    this.addArrayValue = this.addArrayValue.bind(this);
  }

  addArrayValue(prop, value) {
    let array = value.valueSeq().toArray();
    if (!array) {
      array = [];
    }
    array.push('');
    const serviceId = this.props.entity.get('id');
    this.doFor(serviceId, 'change', {path: prop, newValue: array});
  }

  render() {
    const {entity, schema} = this.props;
    const fields = entity._state
      .sortBy(
        (v, k) => k,
        (a, b) => {
          if (a < b) {
            return -1;
          }
          if (a > b) {
            return 1;
          }
          return 0;
        }
      )
      .map((v, k) => {
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
        const addArrayValue = (prop, value) => () =>
          this.addArrayValue(prop, value);

        switch (type) {
          case 'bool':
          case 'date':
          case 'time':
          case 'datetime':
          case 'price':
          case 'weight':
          case 'length':
          case 'pixel':
          case 'volume':
          case 'number':
          case 'percent':
          case 'delay':
          case 'string':
            return <Field kind={type} labelText={k} model={`.${k}`} />;
          case 'entityId':
            return <Field labelText={k} model={`.${k}`} />;
          case 'enum':
            return (
              <Field
                kind="combo"
                list={propInfo.get('values')}
                labelText={k}
                model={`.${k}`}
              />
            );
          case 'array':
            return (
              <Container kind="column">
                <Container kind="row">
                  <Label text={k} />
                </Container>
                {v
                  .valueSeq()
                  .toArray()
                  .map((v, i) => {
                    return (
                      <Container key={i} kind="row">
                        <Field labelText={`${k}[${i}]`} model={`.${k}[${i}]`} />
                      </Container>
                    );
                  })}
                <Container kind="row">
                  <Button
                    text="Add"
                    glyph="solid/plus"
                    onClick={addArrayValue(k, v)}
                  />
                </Container>
              </Container>
            );
          default:
            return (
              <Label
                text={k + ': non handled type ' + type}
                glyph="solid/exclamation-triangle"
              />
            );
        }
      });
    return (
      <Container kind="pane">
        {fields
          .valueSeq()
          .toArray()
          .map((field, index) => {
            return (
              <Container kind="row" key={index}>
                {field}
              </Container>
            );
          })}
      </Container>
    );
  }
}

const EntityPropsWithSchema = Widget.connect((state, prop) => {
  const type = prop.entity.get('id').split('@', 1)[0];
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
