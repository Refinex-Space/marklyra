// document/text-bundle.
export default function initializeDocumentTextBundle(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var assetStorage = requireModule('media/asset-storage'),
    utilities = requireModule('shared/utilities'),
    recovery = requireModule('document/recovery'),
    textBundle = {
      loadFile: async function (filePath) {
        var textFile,
          savedContent,
          bundleFile,
          zip = new (reqnode('adm-zip'))(filePath);
        zip.getEntries().forEach(function (item) {
          if (
            bundleFile ||
            ((bundleFile = item.entryName.split('/')[0]), /textbundle$/.exec(bundleFile))
          ) {
            if (-1 !== item.entryName.indexOf(bundleFile + '/')) {
              var textSlice = item.entryName.substring(bundleFile.length + 1);
              if ('info.json' === textSlice) {
                item.getData().toString('utf8');
              } else {
                if (/^text\./.exec(textSlice)) {
                  var match = item.name.match(/(?:^|\.)([^.]+)$/);
                  match = (match[1] || '').toLowerCase();
                  if (~File.SupportedTextFiles.indexOf(match)) {
                    textFile = item.entryName;
                    savedContent = item.getData().toString('utf8');
                  }
                }
              }
            }
          } else {
            bundleFile = '';
          }
        });
        if (!textFile) {
          throw new Error(assetStorage.NotMarkdownError);
        }
        recovery.textBundleDraftFolder().then((unzipFolder) => {
          const fileSystemExtra = reqnode('fs-extra'),
            mappedItems = zip.getEntries().map(async function (item) {
              if (-1 === item.entryName.indexOf(bundleFile + '/')) {
                return Promise.resolve();
              }
              var relativeDirectory = item.entryName
                .substring(bundleFile.length + 1)
                .split('/')
                .slice(0, -1)
                .join('/');
              if (!item.isDirectory) {
                let destinationDirectory =
                  unzipFolder + (File.isWin ? '\\' : '/') + relativeDirectory;
                return new Promise((resolvePromise, rejectPromise) => {
                  try {
                    fileSystemExtra.ensureDirSync(destinationDirectory);
                  } catch (error) {
                    fileSystemExtra.unlinkSync(destinationDirectory);
                    fileSystemExtra.ensureDirSync(destinationDirectory);
                  }
                  const entryBytes = zip.readFile(item);
                  fileSystemExtra.writeFile(
                    destinationDirectory + (File.isWin ? '\\' : '/') + item.name,
                    entryBytes,
                    function (inputError) {
                      if (inputError) {
                        rejectPromise(inputError);
                      } else {
                        resolvePromise();
                      }
                    },
                  );
                });
              }
              return Promise.resolve();
            });
          Promise.all(mappedItems).then(
            () => {
              File.bundle.unzipFolder = unzipFolder;
              File.editor.imgEdit.refreshLocalImg(true);
            },
            () => {
              File.bundle.unsupported = File.UNSUPPORTED_REASON.READ_FAIL;
            },
          );
        });
        File.bundle = {
          fileEncode: 'utf8',
          filePath: filePath,
          savedContent: savedContent,
          modifiedDate: new Date(),
          type: File.FileType.TextPack,
          textFile: textFile,
          bundleFile: bundleFile,
          zip: zip,
          unzipFolder: '',
        };
        return savedContent;
      },
      findUnusedAssets: async function () {
        if (!File.isNode || !File.isTextPack() || !File.bundle.zip) {
          return [];
        }
        var usedAssets = assetStorage.getAllUsedAssets(true),
          set = new Set();
        File.bundle.zip.getEntries().map(async function (item) {
          if (-1 === item.entryName.indexOf(File.bundle.bundleFile + '/assets/')) {
            return Promise.resolve();
          }
          var textSlice = item.entryName.substring(
            File.bundle.bundleFile.length + '/assets/'.length,
          );
          if (!usedAssets.has(textSlice)) {
            set.add(textSlice);
          }
        });
        return set;
      },
      recordUnusedAssets: function () {
        const unusedAssets = textBundle.findUnusedAssets();
        File.bundle.unusedAssets = Array.from(unusedAssets || []);
      },
      zipFolder: async function (folderPath, archivePath) {
        const archive = new (reqnode('adm-zip'))();
        archive.addLocalFolder(folderPath, utilities.getFolder(folderPath));
        archive.writeZip(archivePath);
      },
      saveFile: async function (targetPath, markdownText) {
        const fileSystemExtra = reqnode('fs-extra');
        var set = new Set(assetStorage.getAllUsedAssets(true));
        File.bundle.unusedAssets.forEach((item) => {
          set.add(item);
        });
        var currentSet = new Set(set),
          localSet = new Set(set);
        File.bundle.zip.getEntries().map(async function (item) {
          if (-1 === item.entryName.indexOf(File.bundle.bundleFile + '/assets/')) {
            return Promise.resolve();
          }
          var textSlice = item.entryName.substring(
            File.bundle.bundleFile.length + '/assets/'.length,
          );
          currentSet.add(textSlice);
          localSet.delete(textSlice);
        });
        set.forEach((item) => {
          currentSet.delete(item);
        });
        if (!currentSet.size) {
          localSet.forEach(function (item) {
            File.bundle.zip.addLocalFile(
              `${File.bundle.unzipFolder}/assets/${item}`,
              `${File.bundle.bundleFile}/assets/`,
            );
          });
          File.bundle.zip.updateFile(File.bundle.textFile, Buffer.from(markdownText, 'utf8'));
          try {
            return void File.bundle.zip.writeZip(targetPath);
          } catch (error) {}
        }
        const zip = new (reqnode('adm-zip'))();
        zip.addFile(File.bundle.textFile, Buffer.from(markdownText, 'utf8'));
        set.forEach(function (item) {
          zip.addLocalFile(
            `${File.bundle.unzipFolder}/assets/${item}`,
            `${File.bundle.bundleFile}/assets/`,
          );
        });
        if (fileSystemExtra.pathExistsSync(`${File.bundle.unzipFolder}/info.json`)) {
          zip.addLocalFile(`${File.bundle.unzipFolder}/info.json`, `${File.bundle.bundleFile}`);
        }
        File.bundle.zip = zip;
        File.bundle.zip.writeZip(targetPath);
      },
    };
  moduleRecord.exports = textBundle;
}
