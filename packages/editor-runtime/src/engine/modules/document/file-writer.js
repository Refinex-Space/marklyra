// document/file-writer.
export default function initializeDocumentFileWriter(requireModule, moduleExports, moduleRecord) {
  'use strict';
  var hostGlobal = this || self;
  if (window.reqnode) {
    var fileSystem = reqnode('fs'),
      pathUtilities = reqnode('path'),
      pendingWriters = {},
      getTemporaryWritePath = function (filePath) {
        return pathUtilities.join(
          pathUtilities.dirname(filePath),
          '.~' + pathUtilities.basename(filePath),
        );
      },
      FileWriter = function (file) {
        this.file = file;
        this.callbacks = [];
        this.nextData = null;
        this.nextCallbacks = [];
      };
    FileWriter.prototype.write = function (inputNextData, onComplete) {
      var receiver = this;
      function finishFailedWrite(writeError) {
        for (; this.callbacks.length; ) {
          this.callbacks.shift()(writeError);
        }
        onComplete(writeError);
        startNextWrite();
      }
      function startNextWrite() {
        receiver.lock = false;
        if (receiver.nextData) {
          var nextData = receiver.nextData;
          receiver.callbacks = receiver.nextCallbacks;
          receiver.nextData = null;
          receiver.nextCallbacks = [];
          receiver.write(nextData, receiver.callbacks.pop());
        }
      }
      function finishSuccessfulWrite(writeError, createdFile) {
        for (; this.callbacks.length; ) {
          this.callbacks.shift()(writeError);
        }
        onComplete(null, createdFile);
        startNextWrite();
      }
      function verifyWrittenBytes(onVerified) {
        fileSystem.readFile(this.file, (error, fileContent) => {
          onVerified(!!error || 0 == Buffer.compare(inputNextData, fileContent));
        });
      }
      if (this.lock) {
        if (onComplete) {
          this.nextCallbacks.push(onComplete);
        }
        this.nextData = inputNextData;
      } else {
        this.lock = true;
        fileSystem.stat(
          this.file,
          function (statError, fileInfo) {
            if (!statError && fileInfo) {
              var temporaryPath = getTemporaryWritePath(this.file);
              fileSystem.writeFile(
                temporaryPath,
                inputNextData,
                function (temporaryWriteError) {
                  if (temporaryWriteError) {
                    console.log('[Warn] write to tmp file failed');
                    if (hostGlobal.File && hostGlobal.File.backupVersionWorker) {
                      File.backupVersionWorker();
                    }
                  }
                  fileSystem.writeFile(
                    this.file,
                    inputNextData,
                    function (writeError) {
                      if (writeError) {
                        finishFailedWrite.call(this, writeError);
                      } else {
                        verifyWrittenBytes.call(this, (contentAccepted) => {
                          if (contentAccepted) {
                            fileSystem.open(this.file, (openError, fileDescriptor) => {
                              if (!openError) {
                                fileSystem.fsync(fileDescriptor, function () {
                                  fileSystem.close(fileDescriptor, function () {});
                                });
                              }
                            });
                            fileSystem.unlink(temporaryPath, finishSuccessfulWrite.bind(this));
                          } else {
                            finishFailedWrite.call(this, new Error('write data failed'));
                          }
                        });
                      }
                    }.bind(this),
                  );
                }.bind(this),
              );
            } else {
              (function () {
                fileSystem.writeFile(
                  this.file,
                  inputNextData,
                  function (writeError) {
                    if (writeError) {
                      finishFailedWrite.call(this, writeError);
                    } else {
                      verifyWrittenBytes.call(this, (contentAccepted) => {
                        if (contentAccepted) {
                          finishSuccessfulWrite.call(this, null, true);
                        } else {
                          finishFailedWrite.call(this, new Error('write data failed'));
                        }
                      });
                    }
                  }.bind(this),
                );
              }).call(this);
            }
          }.bind(this),
        );
      }
    };
    moduleExports.writeFile = function (filePath, fileData, onComplete) {
      filePath = pathUtilities.resolve(filePath);
      pendingWriters[filePath] = pendingWriters[filePath] || new FileWriter(filePath);
      pendingWriters[filePath].write(fileData, onComplete);
    };
    moduleExports.writeFileSync = function (filePath, fileData) {
      fileSystem.writeFileSync(getTemporaryWritePath(filePath), fileData);
      fileSystem.renameSync(getTemporaryWritePath(filePath), filePath);
    };
  }
}
