const Papa = require('papaparse');
const watt = require('gigawatts');
const path = require('path');

class FileOutput {
  constructor(filePath) {
    if (!filePath) {
      throw new Error('FileOutput: required filePath at constructor');
    }
    const fs = require('fs');
    this.filePath = filePath;
    this.file = fs.createWriteStream(filePath);
    console.log('FileOutput started: ', this.filePath);
    watt.wrapAll(this);
  }

  _write(data, cb) {
    if (!this.file.write(data)) {
      this.file.once('drain', cb);
    } else {
      process.nextTick(cb);
    }
  }

  *dispose(next) {
    this.file.end('');
    yield this.file.once('finish', next.arg(0));
    console.log('FileOutput disposed:', this.filePath);
  }
}

class CSVOutput extends FileOutput {
  constructor(filePath, config = {header: true}) {
    super(filePath);
    this.config = config;
    this.firstLine = true;
    watt.wrapAll(this);
  }

  *insert(row, next) {
    let data;
    if (this.firstLine) {
      this.firstLine = false;
      data = Papa.unparse([row], this.config);
      data = '\ufeff' + data;
    } else {
      //force no-header
      this.config.header = false;
      data = Papa.unparse([row], this.config);
    }
    data = data + '\n';
    yield this._write(data, next.arg(0));
    return this;
  }

  *dispose() {
    yield super.dispose();
  }

  //Factory
  static prepare(exportPath) {
    return (fileName, config) => {
      return new CSVOutput(path.join(exportPath, fileName), config);
    };
  }
}

class JSONOutput extends FileOutput {
  constructor(filePath) {
    super(filePath);
    this.firstLine = true;
    watt.wrapAll(this);
  }

  *insert(row, next) {
    if (this.firstLine) {
      this.firstLine = false;
      yield this._write('[', next.arg(0));
    }
    yield this._write(`${JSON.stringify(row)},\n`, next.arg(0));
    return this;
  }

  *dispose(next) {
    yield this._write(']', next.arg(0));
    yield super.dispose();
  }

  //Factory
  static prepare(exportPath) {
    return (fileName) => {
      return new JSONOutput(path.join(exportPath, fileName));
    };
  }
}

module.exports = {JSONOutput, CSVOutput, FileOutput};
