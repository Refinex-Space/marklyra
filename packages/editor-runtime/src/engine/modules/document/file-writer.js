// document/file-writer.
// SystemJS module 3b. Dependencies: none.
$__System.registerDynamic('3b', [], !0, function (requireModule, moduleExports, moduleRecord) {
  'use strict';
  var hostGlobal = this || self;
  if (window.reqnode) {
    var fileSystem = reqnode('fs'),
      pathUtilities = reqnode('path'),
      pendingWriters = {},
      s = function (filePath) {
        return pathUtilities.join(
          pathUtilities.dirname(filePath),
          '.~' + pathUtilities.basename(filePath),
        );
      },
      l = function (file) {
        (this.file = file),
          (this.callbacks = []),
          (this.nextData = null),
          (this.nextCallbacks = []);
      };
    (l.prototype.write = function (inputNextData, onComplete) {
      var receiver = this;
      function o(writeError) {
        for (; this.callbacks.length; ) this.callbacks.shift()(writeError);
        onComplete(writeError), a();
      }
      function a() {
        if (((receiver.lock = !1), receiver.nextData)) {
          var nextData = receiver.nextData;
          (receiver.callbacks = receiver.nextCallbacks),
            (receiver.nextData = null),
            (receiver.nextCallbacks = []),
            receiver.write(nextData, receiver.callbacks.pop());
        }
      }
      function l(writeError, createdFile) {
        for (; this.callbacks.length; ) this.callbacks.shift()(writeError);
        onComplete(null, createdFile), a();
      }
      function c(onVerified) {
        fileSystem.readFile(this.file, (error, fileContent) => {
          onVerified(!!error || 0 == Buffer.compare(inputNextData, fileContent));
        });
      }
      this.lock
        ? (onComplete && this.nextCallbacks.push(onComplete), (this.nextData = inputNextData))
        : ((this.lock = !0),
          fileSystem.stat(
            this.file,
            function (statError, fileInfo) {
              if (!statError && fileInfo) {
                var temporaryPath = s(this.file);
                fileSystem.writeFile(
                  temporaryPath,
                  inputNextData,
                  function (temporaryWriteError) {
                    temporaryWriteError &&
                      (console.log('[Warn] write to tmp file failed'),
                      hostGlobal.File &&
                        hostGlobal.File.backupVersionWorker &&
                        File.backupVersionWorker()),
                      fileSystem.writeFile(
                        this.file,
                        inputNextData,
                        function (writeError) {
                          writeError
                            ? o.call(this, writeError)
                            : c.call(this, (contentAccepted) => {
                                contentAccepted
                                  ? (fileSystem.open(this.file, (openError, fileDescriptor) => {
                                      openError ||
                                        fileSystem.fsync(fileDescriptor, function () {
                                          fileSystem.close(fileDescriptor, function () {});
                                        });
                                    }),
                                    fileSystem.unlink(temporaryPath, l.bind(this)))
                                  : o.call(this, new Error('write data failed'));
                              });
                        }.bind(this),
                      );
                  }.bind(this),
                );
              } else
                (function () {
                  fileSystem.writeFile(
                    this.file,
                    inputNextData,
                    function (writeError) {
                      writeError
                        ? o.call(this, writeError)
                        : c.call(this, (contentAccepted) => {
                            contentAccepted
                              ? l.call(this, null, !0)
                              : o.call(this, new Error('write data failed'));
                          });
                    }.bind(this),
                  );
                }).call(this);
            }.bind(this),
          ));
    }),
      (moduleExports.writeFile = function (filePath, fileData, onComplete) {
        (filePath = pathUtilities.resolve(filePath)),
          (pendingWriters[filePath] = pendingWriters[filePath] || new l(filePath)),
          pendingWriters[filePath].write(fileData, onComplete);
      }),
      (moduleExports.writeFileSync = function (filePath, fileData) {
        fileSystem.writeFileSync(s(filePath), fileData),
          fileSystem.renameSync(s(filePath), filePath);
      });
  }
});
