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
    this.error = null;
    this.file.on('error', (err) => {
      this.error = this.error || err;
    });
    this.writeAtEnd = writeAtEnd;
    console.log('FileOutput started: ', this.filePath);
  }

  _write(data, cb) {
    if (this.error) {
      process.nextTick(cb, this.error);
      return;
    }
    this.file.write(data, (err) => cb(err || this.error));
  }

  dispose(cb) {
    const done = () => {
      console.log('FileOutput disposed:', this.filePath);
      cb(this.error);
    };

    if (this.file.closed) {
      process.nextTick(done);
      return;
    }

    this.file.once('close', done);
    try {
      if (this.writeAtEnd === null) {
        this.file.end((err) => {
          this.error = this.error || err;
        });
      } else {
        this.file.end(this.writeAtEnd, (err) => {
          this.error = this.error || err;
        });
      }
    } catch (err) {
      this.error = this.error || err;
      this.file.destroy();
    }
  }
}

class CSVOutput extends FileOutput {
  constructor(filePath, config = {header: true}) {
    super(filePath);
    this.config = {...config};
    this.firstLine = true;
    watt.wrapAll(this);
  }

  *insert(row, next) {
    let data;
    //json2csv only support array or object as row
    if (row === null || typeof row !== 'object') {
      row = {column: row};
    }
    if (this.firstLine) {
      this.firstLine = false;
      data = Papa.unparse([row], this.config);
      data = '\ufeff' + data;
    } else {
      //force no-header
      data = Papa.unparse([row], {...this.config, header: false});
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
    const serializedRow = JSON.stringify(row);
    if (serializedRow === undefined) {
      throw new Error('JSONOutput: row is not JSON serializable');
    }
    if (this.firstLine) {
      this.firstLine = false;
      yield this._write(`[${serializedRow}`, next.arg(0));
    } else {
      yield this._write(`,\n${serializedRow}`, next.arg(0));
    }
    return this;
  }

  dispose(cb) {
    this.writeAtEnd = this.firstLine ? '[]' : ']';
    super.dispose(cb);
  }

  //Factory
  static prepare(exportPath) {
    return (fileName) => {
      return new JSONOutput(path.join(exportPath, path.basename(fileName)));
    };
  }
}

module.exports = {JSONOutput, CSVOutput, FileOutput};
