import React from 'react';
import T from 't';

import StateBrowser from 'goblin-gadgets/widgets/state-browser/widget';
import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';
import Label from 'goblin-gadgets/widgets/label/widget';

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
            labelText="Intitulé"
            tooltip={T('Intitulé de la colonne visible en haut')}
            model=".text"
          />
        </Container>
        <Container kind="row">
          <Field
            labelText="Champ"
            tooltip={T('Chemin du champ')}
            model=".path"
            verticalSpacing="overlap"
          />
        </Container>
        <Container kind="row">
          <Label width="120px" />
          <StateBrowser path={`entity-schema@${props.entityType}`} />
        </Container>
        <Container kind="row" height="10px" />
        <Container kind="row">
          <Field
            labelText="Largeur"
            fieldWidth="100px"
            tooltip={T('Largeur absolue')}
            hintText={T('Absolue')}
            model=".width"
            verticalSpacing="overlap"
            horizontalSpacing="large"
          />
          <Field
            labelWidth="0px"
            fieldWidth="100px"
            tooltip={T('Largeur relative')}
            hintText={T('Relative')}
            model=".grow"
            verticalSpacing="overlap"
          />
          <Label width="20px" />
          <Label text={T('(absolue ou relative)')} />
        </Container>
      </Container>
    </Container>
  );
}

function renderPluginCompact(props) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
        <Field
          tooltip={T('Intitulé')}
          labelWidth="0px"
          model=".text"
          showStrategy="alwaysVisible"
          horizontalSpacing="overlap"
          verticalSpacing="overlap"
        />
        <Field
          tooltip={T('Champ')}
          labelWidth="0px"
          model=".path"
          showStrategy="alwaysVisible"
          horizontalSpacing="overlap"
          verticalSpacing="overlap"
        />
      </Container>
      <Container kind="row"></Container>
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
          labelText="Champ"
          tooltip={T('Chemin du champ')}
          model=".path"
          verticalSpacing="overlap"
        />
      </Container>
      <Container kind="row">
        <Label width="120px" />
        <StateBrowser path={`entity-schema@${props.entityType}`} />
      </Container>
      <Container kind="row" height="10px" />
      <Container kind="row">
        <Field
          labelText="Largeur"
          fieldWidth="100px"
          tooltip={T('Largeur absolue')}
          hintText={T('Absolue')}
          model=".width"
          verticalSpacing="overlap"
          horizontalSpacing="large"
        />
        <Field
          labelWidth="0px"
          fieldWidth="100px"
          tooltip={T('Largeur relative')}
          hintText={T('Relative')}
          model=".grow"
          verticalSpacing="overlap"
        />
        <Label width="20px" />
        <Label text={T('(absolue ou relative)')} />
      </Container>
      <Container kind="row">
        <StateBrowser path={`entity-schema@${props.entityType}`} />
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
