//T:2019-02-27

import React from 'react';
import Widget from 'goblin-laboratory/widgets/widget';
import View from 'goblin-laboratory/widgets/view';
import Container from 'goblin-gadgets/widgets/container/widget.js';
import Button from 'goblin-gadgets/widgets/button/widget.js';
import Label from 'goblin-gadgets/widgets/label/widget.js';
import Separator from 'goblin-gadgets/widgets/separator/widget.js';
import GoblinEditor from 'goblin-gadgets/widgets/goblin-editor/widget.js';
import T from 't';

class ConsoleNC extends Widget {
  constructor() {
    super(...arguments);
    this.editorElement = null;
    this._initSource = this._initSource.bind(this);
    this.assign = this.assign.bind(this);
  }

  _initSource() {
    const {lines, printStatus} = this.props;
    const source = `[${lines.join(',\n')}]\n//${printStatus}`;
    this.editorElement.setSource(source);
  }

  assign(component) {
    this.editorElement = component;
  }

  componentDidUpdate() {
    this._initSource();
  }

  componentDidMount() {
    this._initSource();
  }

  render() {
    return <GoblinEditor ref={this.assign} source={''} />;
  }
}

const Console = Widget.connect((state, prop) => {
  const lines = state.get(`backend.${prop.id}.lines`);
  const printStatus = state.get(`backend.${prop.id}.printStatus`);
  if (!lines) {
    return {lines: [], printStatus: ''};
  }
  return {lines, printStatus};
})(ConsoleNC);
class RethinkQueryEditor extends Widget {
  constructor() {
    super(...arguments);
    this.update = this.update.bind(this);
    this.run = this.run.bind(this);
    this.save = this.save.bind(this);
    this.editorElement = undefined;
    this.assign = this.assign.bind(this);
  }

  assign(component) {
    this.editorElement = component;
  }

  run() {
    this.do('run');
  }

  save() {
    this.editorElement.format();
    this.do('save');
  }

  update(value) {
    this.do('update', {src: value});
  }

  render() {
    const {name} = this.props;
    return (
      <Container kind="pane" height="100%" busy={this.props.isRunning}>
        <Container kind="row" grow="1">
          <Label text={name} />
          <Button
            kind="secondary-action"
            place="1/2"
            text={T('Enregistrer')}
            glyph="solid/save"
            width="140px"
            active={false}
            onClick={this.save}
          />
          <Button
            kind="secondary-action"
            place="2/2"
            text={T('Exécuter')}
            glyph="solid/rocket"
            width="140px"
            active={false}
            onClick={this.run}
          />
        </Container>
        <Separator height="20px" />
        <Container kind="row" height="100%" grow="1">
          <Container kind="column" width="100%" height="100%" grow="1">
            <GoblinEditor
              ref={this.assign}
              source={this.props.source}
              onUpdate={this.update}
            />
          </Container>
          <Container kind="column" width="100%" height="100%" grow="1">
            <Console id={this.props.id} />
          </Container>
        </Container>
      </Container>
    );
  }
}

const EditorLoaderNC = (props) => {
  if (!props.loaded) {
    return null;
  }
  return (
    <RethinkQueryEditor
      id={props.id}
      desktopId={props.desktopId}
      jobId={props.jobId}
      name={props.name}
      source={props.source}
      isRunning={props.isRunning}
    />
  );
};

const EditorLoader = Widget.connect((state, prop) => {
  const ide = state.get(`backend.${prop.id}`);

  if (!ide) {
    return {loaded: false};
  } else {
    const {name, source, jobId, isRunning} = ide.pick(
      'name',
      'source',
      'jobId',
      'isRunning'
    );
    return {loaded: true, name, source, jobId, isRunning};
  }
})(EditorLoaderNC);

class PlaygroundEditorView extends View {
  constructor() {
    super(...arguments);
  }

  render() {
    const {workitemId, desktopId} = this.props;
    return (
      <Container kind="row" grow="1" width="100%">
        <Container kind="column" height="100%" grow="1">
          <EditorLoader id={workitemId} desktopId={desktopId} />
        </Container>
      </Container>
    );
  }
}

export default PlaygroundEditorView;
