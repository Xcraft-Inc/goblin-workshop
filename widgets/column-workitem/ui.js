import React from 'react';
import T from 't';
import C from 'goblin-laboratory/widgets/connect-helpers/c';

import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';
import Label from 'goblin-gadgets/widgets/label/widget';

import ListHelpers from 'goblin-workshop/lib/list-helpers.js';

/******************************************************************************/

function buildText(text) {
  return {text};
}

function buildPath(text) {
  return {text};
}

function buildWidth(column) {
  const props = ListHelpers.getColumnProps(column);
  const text = props.width;
  return {text};
}

/******************************************************************************/

function renderPanel(props) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Container kind="row-pane">
          <Label text={T('Colonne')} grow="1" kind="title" />
        </Container>
        <Container kind="row">
          <Field
            labelText={T('Intitulé')}
            tooltip={T('Intitulé de la colonne visible en haut')}
            model=".text"
          />
        </Container>
        <Container kind="row">
          <Field
            labelText={T('Champ')}
            grow="1"
            tooltip={T('Chemin du champ')}
            model=".path"
            kind="state-browser"
            path={`backend.entity-schema@${props.entityType}`}
            verticalSpacing="overlap"
            horizontalSpacing="large"
          />
        </Container>
        <Container kind="row">
          <Field
            labelText={T('Type')}
            grow="1"
            readonly={true}
            model=".type"
            verticalSpacing="overlap"
          />
        </Container>
        <Container kind="row" height="10px" />
        <Container kind="row">
          <Field
            labelText="Largeur"
            fieldWidth="100px"
            tooltip={T('Largeur en points')}
            model=".width"
            verticalSpacing="overlap"
          />
        </Container>
      </Container>
    </Container>
  );
}

function renderPluginCompact(props) {
  return (
    <Container kind="row" grow="1">
      <Label
        kind="field-combo"
        grow="1"
        justify="start"
        tooltip={T('Intitulé')}
        horizontalSpacing="overlap"
        {...C('.text', buildText)}
      />
      <Label
        kind="field-combo"
        grow="1"
        justify="start"
        tooltip={T('Champ')}
        horizontalSpacing="overlap"
        {...C('.path', buildPath)}
      />
      <Label
        kind="field-combo"
        width="100px"
        justify="end"
        tooltip={T('Largeur en points')}
        {...C('.', buildWidth)}
      />
    </Container>
  );
}

function renderPluginExtend(props) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
        <Field
          labelText="Intitulé"
          tooltip={T('Intitulé de la colonne visible en haut')}
          model=".text"
        />
      </Container>
      <Container kind="row">
        <Field
          labelText={T('Champ')}
          grow="1"
          tooltip={T('Chemin du champ')}
          model=".path"
          value
          kind="state-browser"
          path={`backend.entity-schema@${props.entityType}`}
          verticalSpacing="overlap"
        />
      </Container>
      <Container kind="row">
        <Field
          labelText={T('Type')}
          grow="1"
          readonly={true}
          model=".type"
          verticalSpacing="overlap"
        />
      </Container>
      <Container kind="row" height="10px" />
      <Container kind="row">
        <Field
          labelText="Largeur"
          fieldWidth="100px"
          tooltip={T('Largeur en points')}
          model=".width"
          verticalSpacing="overlap"
        />
      </Container>
    </Container>
  );
}

/******************************************************************************/

function mapper(state) {
  return {
    type: state && state.get('type'),
    entityType: state && state.get('meta.parentEntity').split('@')[1],
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
      compact: renderPluginCompact,
      extend: renderPluginExtend,
    },
    edit: {
      compact: renderPluginCompact,
      extend: renderPluginExtend,
    },
  },
};
