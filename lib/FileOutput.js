const Papa = require('papaparse');
const watt = require('gigawatts');
const path = require('path');

class FileOutput {
  constructor(filePath, writeAtEnd = null) {
    if (!filePath) {
      throw new Error('FileOutput: required filePath at constructor');
    }
    const fs = require('fs');
    this.filePath = filePath;
    this.file = fs.createWriteStream(filePath);
    this.writeAtEnd = writeAtEnd;
    console.log('FileOutput started: ', this.filePath);
  }

  _write(data, cb) {
    if (!this.file.write(data)) {
      this.file.once('drain', cb);
    } else {
      process.nextTick(cb);
    }
  }

  dispose(cb) {
    this.file.end(this.writeAtEnd, cb);
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
    //json2csv only support array or object as row
    if (typeof row !== 'object' && !Array.isArray(row)) {
      row = {column: row};
    }
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

  //Factory
  static prepare(exportPath) {
    return (fileName, config) => {
      return new CSVOutput(
        path.join(exportPath, path.basename(fileName)),
        config
      );
    };
  }
}

class JSONOutput extends FileOutput {
  constructor(filePath) {
    super(filePath, ']');
    this.firstLine = true;
    watt.wrapAll(this);
  }

  *insert(row, next) {
    if (this.firstLine) {
      this.firstLine = false;
      yield this._write(`[${JSON.stringify(row)}`, next.arg(0));
    } else {
      yield this._write(`,\n${JSON.stringify(row)}`, next.arg(0));
    }
    return this;
  }

  //Factory
  static prepare(exportPath) {
    return (fileName) => {
      return new JSONOutput(path.join(exportPath, path.basename(fileName)));
    };
  }
}

module.exports = {JSONOutput, CSVOutput, FileOutput};
