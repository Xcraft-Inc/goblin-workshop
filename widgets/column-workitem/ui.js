import React from 'react';

import EntityBrowser from 'goblin-gadgets/widgets/entity-browser/widget';
import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';

/******************************************************************************/

function renderPanel(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Container kind="row">{props.type}</Container>
        <Field labelText="Intitulé" model=".text" />
        <Field labelText="Chemin" model=".path" />
        <Field labelText="Largeur" model=".width" />
        <Field labelText="Croissance" model=".grow" />
      </Container>
      <Container kind="row">
        <EntityBrowser entityId={'workshop'} />
      </Container>
    </Container>
  );
}

function renderPlugin(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">{props.type}</Container>
      <Container kind="row">
        <Field labelText="Intitulé" model=".text" />
      </Container>
      <Container kind="row">
        <Field labelText="Chemin" model=".path" />
      </Container>
      <Container kind="row">
        <Field labelText="Largeur" model=".width" />
      </Container>
      <Container kind="row">
        <Field labelText="Croissance" model=".grow" />
      </Container>
      <Container kind="row">
        <EntityBrowser entityId={'workshop'} />
      </Container>
    </Container>
  );
}

/******************************************************************************/

function mapper(state) {
  return {
    type: state && state.get('type'),
  };
}

export default {
  mappers: {
    panel: {
      readonly: mapper,
      edit: mapper,
    },
    plugin: {
      readonly: {
        compact: mapper,
        extend: mapper,
      },
      edit: {
        compact: mapper,
        extend: mapper,
      },
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
