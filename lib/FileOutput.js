const Papa = require('papaparse');
const Excel = require('exceljs');
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

class EXCELOutput {
  constructor(filePath, config = {}) {
    if (!filePath) {
      throw new Error('EXCELOutput: required filePath at constructor');
    }
    const fs = require('fs');
    this.filePath = filePath;
    this.file = fs.createWriteStream(filePath);
    this.config = config;
    this.workbook = new Excel.stream.xlsx.WorkbookWriter({
      stream: this.file,
      useStyles: true,
      useSharedStrings: true,
    });
    this.worksheet = this.workbook.addWorksheet(
      config.worksheetName || 'export'
    );
    console.log('EXCELOutput started: ', this.filePath);
    watt.wrapAll(this);
  }

  insert(row) {
    if (typeof row !== 'object' && !Array.isArray(row)) {
      row = {column: row};
    }
    try {
      this.worksheet.addRow(row).commit();
    } catch (ex) {
      console.log(ex);
    }
    return this;
  }

  dispose(cb) {
    this.worksheet.commit();
    this.workbook.commit().then(() => {
      cb();
      console.log('EXCELOutput disposed:', this.filePath);
    });
  }

  //Factory
  static prepare(exportPath) {
    return (fileName, config) => {
      return new EXCELOutput(
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

module.exports = {JSONOutput, CSVOutput, EXCELOutput, FileOutput};
