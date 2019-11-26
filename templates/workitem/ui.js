import T from 't';
import React from 'react';

import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';
import Label from 'goblin-gadgets/widgets/label/widget';
import Button from 'goblin-gadgets/widgets/button/widget';
import Separator from 'goblin-gadgets/widgets/separator/widget';

/******************************************************************************/

function renderModulePanel(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Label kind="title" text={T("Elément d'une liste")} />
        <Field labelText={T('Valeur')} model=".value" />
        <Field labelText={T('Nom')} model=".shortDescription" />
        <Field labelText={T('Description')} rows="5" model=".longDescription" />
      </Container>
    </Container>
  );
}

function renderModuleCompact(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
        <Field
          tooltip={T('Valeur')}
          showStrategy="alwaysVisible"
          model=".value"
          labelWidth="0px"
          fieldWidth="150px"
          verticalSpacing="compact"
        />
        <Field
          labelWidth="10px"
          grow="1"
          tooltip={T('Nom')}
          showStrategy="alwaysVisible"
          model=".shortDescription"
          verticalSpacing="compact"
        />
      </Container>
    </Container>
  );
}

function renderModuleExtend(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Field labelText={T('Valeur')} model=".value" />
      <Field labelText={T('Nom')} model=".shortDescription" />
      <Field
        labelText={T('Description')}
        rows="5"
        model=".longDescription"
        verticalSpacing="compact"
      />
    </Container>
  );
}

/******************************************************************************/

function renderCoursePeriodFields(props) {
  return (
    <Container kind="row">
      <Field
        kind="date"
        labelText={T('Date | De | À')}
        model=".date"
        hintText={T('Date')}
        tooltip={T('Date')}
      />
      <Field
        kind="time"
        labelWidth="10px"
        model=".startTime"
        hintText={T('Début')}
        tooltip={T('Heure de début')}
        horizontalSpacing="overlap"
      />
      <Field
        kind="time"
        labelWidth="0px"
        model=".endTime"
        hintText={T('Fin')}
        tooltip={T('Heure de fin')}
      />
    </Container>
  );
}

function renderCoursePeriodButtons(props) {
  return (
    <Container kind="column">
      <Separator height="20px" />
      <Container kind="row">
        <Label text={T('Matin')} width="120px" />
        <Button kind="action" place="1/3" text="08:30 — 12:00" />
        <Button kind="action" place="2/3" text="09:30 — 12:00" />
        <Button kind="action" place="3/3" text="09:30 — 13:00" />
      </Container>
      <Separator kind="exact" height="10px" />
      <Container kind="row">
        <Label text={T('Après-midi')} width="120px" />
        <Button kind="action" place="1/3" text="13:30 — 17:00" />
        <Button kind="action" place="2/3" text="13:30 — 17:30" />
        <Button kind="action" place="3/3" text="14:00 — 17:30" />
      </Container>
    </Container>
  );
}

function renderCoursePeriodPanel(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">
        <Container kind="row-pane">
          <Label kind="title" text={T('Période de cours')} />
        </Container>
        {renderCoursePeriodFields(props)}
        {readonly ? null : renderCoursePeriodButtons(props)}
      </Container>
    </Container>
  );
}

function renderCoursePeriodCompact(props, readonly) {
  return (
    <Container kind="column" grow="1">
      <Container kind="row">
        <Field
          kind="date"
          labelWidth="0px"
          model=".date"
          hintText={T('Date')}
          tooltip={T('Date')}
          verticalSpacing="compact"
        />
        <Field
          kind="time"
          labelWidth="10px"
          model=".startTime"
          hintText={T('Début')}
          tooltip={T('Heure de début')}
          horizontalSpacing="overlap"
          verticalSpacing="compact"
        />
        <Field
          kind="time"
          labelWidth="0px"
          model=".endTime"
          hintText={T('Fin')}
          tooltip={T('Heure de fin')}
          verticalSpacing="compact"
        />
      </Container>
    </Container>
  );
}

function renderCoursePeriodExtend(props, readonly) {
  return (
    <Container kind="column" grow="1">
      {renderCoursePeriodFields(props)}
      {readonly ? null : renderCoursePeriodButtons(props)}
    </Container>
  );
}

/******************************************************************************/

function renderPanelReadonly(props) {
  if (props.kind === 'course') {
    return renderCoursePeriodPanel(props, true);
  } else {
    return renderModulePanel(props, true);
  }
}

function renderPanelEdit(props) {
  if (props.kind === 'course') {
    return renderCoursePeriodPanel(props, false);
  } else {
    return renderModulePanel(props, false);
  }
}

function renderCompactReadonly(props) {
  if (props.kind === 'course') {
    return renderCoursePeriodCompact(props, true);
  } else {
    return renderModuleCompact(props, true);
  }
}

function renderCompactEdit(props) {
  if (props.kind === 'course') {
    return renderCoursePeriodCompact(props, false);
  } else {
    return renderModuleCompact(props, false);
  }
}

function renderExtendReadonly(props) {
  if (props.kind === 'course') {
    return renderCoursePeriodExtend(props, true);
  } else {
    return renderModuleExtend(props, true);
  }
}

function renderExtendEdit(props) {
  if (props.kind === 'course') {
    return renderCoursePeriodExtend(props, false);
  } else {
    return renderModuleExtend(props, false);
  }
}

/******************************************************************************/

const mapProps = entity => {
  return {
    kind: entity.get('kind'),
  };
};

export default {
  mappers: {
    panel: {
      readonly: mapProps,
      edit: mapProps,
    },
    plugin: {
      readonly: {
        compact: mapProps,
        extend: mapProps,
      },
      edit: {
        compact: mapProps,
        extend: mapProps,
      },
    },
  },
  panel: {
    readonly: renderPanelReadonly,
    edit: renderPanelEdit,
  },
  plugin: {
    readonly: {
      compact: renderCompactReadonly,
      extend: renderExtendReadonly,
    },
    edit: {
      compact: renderCompactEdit,
      extend: renderExtendEdit,
    },
  },
};
