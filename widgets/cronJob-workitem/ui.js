import React from 'react';

import Container from 'goblin-gadgets/widgets/container/widget';
import Field from 'goblin-gadgets/widgets/field/widget';
import Label from 'goblin-gadgets/widgets/label/widget';
import T from 't';
import C from 'goblin-laboratory/widgets/connect-helpers/c';
import Fragment from 'goblin-gadgets/widgets/fragment/widget';
import ButtonNC from 'goblin-gadgets/widgets/button/widget';
import LabelRow from 'goblin-gadgets/widgets/label-row/widget';
import withC from 'goblin-laboratory/widgets/connect-helpers/with-c';
const Button = withC(ButtonNC);

/******************************************************************************/

const jobTypes = [
  {value: 'event', text: T('Événement')},
  {value: 'quest', text: T('Quête')},
];

function renderFields(props) {
  return (
    <React.Fragment>
      <LabelRow verticalJustify="center">
        <Button
          {...C('.enabled', (enabled) =>
            enabled
              ? {
                  text: T('Désactiver la tâche'),
                  glyph: 'solid/stop',
                }
              : {
                  text: T('Activer la tâche'),
                  glyph: 'solid/play',
                }
          )}
          onClick={() => props.do('toggleEnabled')}
          horizontalSpacing="double"
        />
        <Button
          text={T('Exécuter maintenant')}
          show={C('.enabled')}
          onClick={() => props.do('doJob')}
          horizontalSpacing="double"
        />
        <Label text={C('.error')} textColor="red" />
      </LabelRow>
      <Field labelText={T('Description')} model=".description" />
      <Label
        text={T('La tâche doit être désactivée pour être modifiée')}
        textColor="orange"
        bottomSpacing="large"
        show={C('.enabled', Boolean)}
      />
      <Field
        labelText={T('Expr. CRON')}
        model=".cronExpr"
        disabled={C('.enabled', Boolean)}
      />
      <Field
        kind="radio"
        // buttonWidth="120px"
        labelText={T('Type de tâche')}
        model=".job.jobType"
        list={jobTypes}
        disabled={C('.enabled', Boolean)}
      />
      <Fragment show={C('.job.jobType', (jobType) => jobType === 'event')}>
        <Field
          labelText={T('Événement')}
          model=".job.event"
          disabled={C('.enabled', Boolean)}
        />
        <Field
          labelText={T('Arguments')}
          model=".job.eventArgs"
          disabled={C('.enabled', Boolean)}
        />
      </Fragment>
      <Fragment show={C('.job.jobType', (jobType) => jobType === 'quest')}>
        <Field
          labelText={T('Id du goblin')}
          model=".job.goblinId"
          disabled={C('.enabled', Boolean)}
        />
        <Field
          labelText={T('Nom de quête')}
          model=".job.questName"
          disabled={C('.enabled', Boolean)}
        />
        <Field
          labelText={T('Arguments')}
          model=".job.questArgs"
          disabled={C('.enabled', Boolean)}
        />
      </Fragment>
    </React.Fragment>
  );
}

function renderPanel(props) {
  return (
    <Container kind="column" grow="1">
      <Container kind="pane">{renderFields(props)}</Container>
    </Container>
  );
}

function renderCompact(props) {
  return (
    <Container kind="row" grow="1">
      <Field kind="bool" labelWidth="0" model=".enabled" readonly={true} />
      <Field labelWidth="0" model=".description" />
    </Container>
  );
}

function renderExtend(props) {
  return (
    <Container kind="column" grow="1">
      {renderFields(props)}
    </Container>
  );
}

/******************************************************************************/
export default {
  panel: {
    readonly: renderPanel,
    edit: renderPanel,
  },
  plugin: {
    readonly: {
      compact: renderCompact,
      extend: renderExtend,
    },
    edit: {
      compact: renderCompact,
      extend: renderExtend,
    },
  },
};
