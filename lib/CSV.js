const Papa = require('papaparse');
const watt = require('gigawatts');
const path = require('path');

class CSV {
  constructor(filePath, config = {header: true}) {
    if (!filePath) {
      throw new Error('CSV: required filePath at constructor');
    }
    const fs = require('fs');
    this.config = config;
    this.filePath = filePath;
    this.file = fs.createWriteStream(filePath);
    console.log('CSV output started: ', this.filePath);
    this.firstLine = true;
    watt.wrapAll(this);
  }

  _write(data, cb) {
    if (!this.file.write(data)) {
      this.file.once('drain', cb);
    } else {
      process.nextTick(cb);
    }
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

  *dispose(next) {
    this.file.end('');
    yield this.file.once('finish', next.arg(0));
    console.log('CSV output disposed:', this.filePath);
  }

  //Factory
  static prepare(exportPath) {
    return (fileName, config) => {
      return new CSV(path.join(exportPath, fileName), config);
    };
  }
}

module.exports = CSV;
