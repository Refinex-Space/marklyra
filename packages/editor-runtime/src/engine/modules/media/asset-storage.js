// media/asset-storage.
// SystemJS module 34. Dependencies: 11, 33, 35.
$__System.registerDynamic(
  '34',
  ['11', '33', '35'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    this || self;
    var utilities = requireModule('11'),
      fileIntegration = requireModule('33'),
      recovery = requireModule('35');
    const textBundleMetadata = {
      version: 2,
      type: 'net.daringfireball.markdown',
      transient: !1,
      creatorIdentifier: 'io.appmakes.MarkLyra',
    };
    var assetStorage = {
      NotMarkdownError: 'NotMarkdown',
      quickGetContent: async function (filePath, throwOnError) {
        var promises = reqnode('fs').promises;
        try {
          var fileBytes = await promises.readFile(filePath);
          return recovery.saveToRecover(fileBytes, 'overwrite'), fileBytes.toString('utf8');
        } catch (error) {
          if (throwOnError) throw error;
          return '';
        }
      },
      isFileSync: function (filePath) {
        try {
          let fileInfo = reqnode('fs').statSync(filePath);
          return fileInfo.isFile() || fileInfo.isDirectory() || /\.textbundle$/.exec(filePath);
        } catch (error) {
          return !1;
        }
      },
      getTextFile: function () {
        return File.bundle.filePath
          ? File.isTextBundle()
            ? File.bundle.filePath + (File.isWin ? '\\' : '/') + File.bundle.textFile
            : File.bundle.filePath
          : null;
      },
      deletedAssetsMap: function () {
        return File.isTextBundle()
          ? ((File.bundle.deletedAssetsMap = File.bundle.deletedAssetsMap || {}),
            File.bundle.deletedAssetsMap)
          : {};
      },
      saveAssetsBeforeDelete: async function (assetName) {
        if (File.isNode && File.isTextBundle()) {
          var fileSystemExtra = reqnode('fs-extra'),
            deletedAssets = assetStorage.deletedAssetsMap(),
            filePath = File.isWin ? '\\' : '/',
            assetsDirectory = File.bundle.filePath + filePath + 'assets',
            draftDirectory = await recovery.textBundleDraftFolder();
          if (draftDirectory) {
            var backupPath = draftDirectory + filePath + 'assets' + filePath + assetName;
            await fileSystemExtra.move(assetsDirectory + filePath + assetName, backupPath, {
              overwrite: !0,
            }),
              (deletedAssets[assetName] = backupPath);
          }
        }
      },
      getAllUsedAssets: function (relativePaths) {
        var items = [];
        if (!File.isTextBundle() && !File.isTextPack()) return new Set(items);
        var writingArea = document.querySelector('#write'),
          elements = writingArea.querySelectorAll('[data-src]');
        return (
          elements.forEach((item) => {
            if (relativePaths) {
              let text = utilities.trimPathParam(item.dataset.src);
              /^assets[\/\\]/.exec(text) && items.push(text.substring('assets/'.length));
            } else {
              var absoluteImagePath = utilities.absolutePathFrom(
                File.editor.imgEdit.getRealSrc(item.dataset.src),
              );
              /^assets[\/\\]/.exec(item.dataset.src)
                ? items.push(absoluteImagePath)
                : assetStorage.shouldManageResource(absoluteImagePath) &&
                  items.push(absoluteImagePath);
            }
          }),
          (elements = writingArea.querySelectorAll('[src]')).forEach((element) => {
            if (!element.closest('[data-src]')) {
              var managedAssetName,
                absoluteResourcePath = utilities.absolutePathFrom(element.src);
              (managedAssetName = assetStorage.shouldManageResource(absoluteResourcePath)) &&
                relativePaths &&
                items.push(managedAssetName);
            }
          }),
          writingArea.querySelectorAll('[href]').forEach((element) => {
            var linkTarget = element.getAttribute('href');
            if (relativePaths)
              /^assets[\/\\]/.exec(linkTarget) &&
                ((linkTarget = utilities.trimPathParam(linkTarget)),
                items.push(linkTarget.substring('assets/'.length)));
            else {
              var absoluteLinkPath = utilities.ensureAbsolutePath(
                File.bundle.filePath || File.bundle.originalPath,
                linkTarget,
                !0,
              );
              (absoluteLinkPath = utilities.absolutePathFrom(absoluteLinkPath)),
                /^assets[\/\\]/.exec(linkTarget)
                  ? items.push(absoluteLinkPath)
                  : assetStorage.shouldManageResource(absoluteLinkPath) &&
                    items.push(absoluteLinkPath);
            }
          }),
          new Set(items.map(utilities.decodeFromEscapedPath))
        );
      },
      findUnusedAssets: async function () {
        if (!File.isNode || !File.isTextBundle() || !File.bundle.filePath) return [];
        var usedAssets = assetStorage.getAllUsedAssets(),
          promises = reqnode('fs').promises,
          set = new Set(),
          filePath = File.isWin ? '\\' : '/',
          assetsDirectory = File.bundle.filePath + filePath + 'assets';
        try {
          (await promises.readdir(assetsDirectory)).forEach((item) => {
            usedAssets.has(assetsDirectory + filePath + item) || set.add(item);
          });
        } catch (error) {}
        return set;
      },
      recordUnusedAssets: async function () {
        if (File.isNode) {
          const unusedAssets = await assetStorage.findUnusedAssets();
          File.bundle.unusedAssets = Array.from(unusedAssets || []);
        } else {
          var usedAssets = assetStorage.getAllUsedAssets(!0);
          JSBridge.invoke('document.recordUnusedAssets', Array.from(usedAssets));
        }
      },
      removeUnusedAssets: async function () {
        if (!File.isNode || !File.isTextBundle()) return;
        const unusedAssets = await assetStorage.findUnusedAssets();
        await Promise.all(
          Array.from(unusedAssets).map((searchValue) => {
            if (-1 == (File.bundle.unusedAssets || []).indexOf(searchValue))
              return assetStorage.saveAssetsBeforeDelete(searchValue);
          }),
        );
      },
      isEmptyFile: async function (filePath) {
        if (File.isNode) {
          try {
            var fileSystemExtra = reqnode('fs-extra'),
              fileInfo = await fileSystemExtra.stat(filePath);
            if (!/\.textbundle$/.exec(filePath)) return 0 == fileInfo.size;
            if (fileInfo.isDirectory())
              return (
                0 ==
                (fileInfo = await fileSystemExtra.stat(
                  filePath + (File.isWin ? '\\' : '/') + 'text.md',
                )).size
              );
          } catch (error) {
            console.warn(error);
          }
          return !1;
        }
      },
      shouldManageResource: function (text) {
        if (text) {
          var pathSeparator = File.isWin ? '\\' : '/';
          if (File.isTextBundle() || File.isTextPack()) {
            var searchValue =
              (File.isTextPack() ? File.bundle.unzipFolder : File.bundle.filePath) +
              pathSeparator +
              'assets' +
              pathSeparator;
            if (0 === text.indexOf(searchValue)) {
              var textSlice = text.substring(searchValue.length);
              if (!/[\/\\]/.exec(textSlice)) return textSlice;
            }
          }
          return !1;
        }
      },
      findTextFile: async function (separator) {
        var promises = reqnode('fs').promises,
          pathUtilities = reqnode('path');
        try {
          let directoryEntries = await promises.readdir(separator);
          for (var entryName of directoryEntries)
            if (/^text\./.exec(entryName)) {
              var match = entryName.match(/(?:^|\.)([^.]+)$/);
              if (
                ((match = (match[1] || '').toLowerCase()),
                ~File.SupportedTextFiles.indexOf(match) &&
                  (await promises.stat(pathUtilities.join(separator, entryName))).isFile())
              )
                return entryName;
            }
          return null;
        } catch (error) {}
      },
      isTextBundle(filePath) {
        if (!filePath) return !1;
        return 'textbundle' === fileIntegration.getExtension(filePath).toLowerCase();
      },
      isTextPack(filePath) {
        if (!filePath) return !1;
        return 'textpack' === fileIntegration.getExtension(filePath).toLowerCase();
      },
      makeTextBundleSkeleton: async function (bundlePath) {
        const pathSeparator = File.isWin ? '\\' : '/',
          fileSystemExtra = reqnode('fs-extra');
        await fileSystemExtra.ensureDir(bundlePath + pathSeparator + 'assets'),
          await fileSystemExtra.writeFile(
            bundlePath + pathSeparator + 'info.json',
            JSON.stringify(textBundleMetadata),
            'utf8',
          );
      },
      async bundleAssetsIsEmpty(bundlePath) {
        const pathSeparator = File.isWin ? '\\' : '/',
          promises = reqnode('fs').promises;
        try {
          return 0 === (await promises.readdir(bundlePath + pathSeparator + 'assets')).length;
        } catch (error) {}
        return !0;
      },
      convertToTextBundleIfNeeded: async function () {
        if (File.isTextBundle() || File.isTextPack() || !File.isNode) return;
        if (((File.bundle.type = File.FileType.TextBundle), !File.bundle.filePath)) return;
        let filePath = File.bundle.filePath,
          basePath = File.bundle.filePath.replace(/\.[^.]+$/, ''),
          newPath = basePath + '.textbundle',
          fileSystem = reqnode('fs');
        !(function e(collisionIndex) {
          if (
            (collisionIndex > 0 && (newPath = basePath + '-' + collisionIndex + '.textbundle'),
            fileSystem.existsSync(newPath))
          )
            return e(collisionIndex + 1);
        })(0),
          assetStorage.makeTextBundleSkeleton(newPath),
          (File.bundle.textFile = 'text.md'),
          JSBridge.invoke('app.sendEvent', 'willRename', { oldPath: filePath });
        let backupPromise = recovery.saveFileToRecover();
        await File.saveAsUseNode(newPath),
          JSBridge.invoke('app.sendEvent', 'didRename', { oldPath: filePath, newPath: newPath }),
          backupPromise.then(() => {
            fileSystem.rm(filePath);
          });
      },
      loadFile: async function (filePath) {
        var promises = reqnode('fs').promises,
          pathUtilities = reqnode('path');
        let [unusedValue, textFile] = await Promise.all([
          (async function () {
            try {
              let metadataPath = pathUtilities.join(filePath, 'info.json');
              return JSON.parse(await promises.readFile(metadataPath, 'utf8'));
            } catch (error) {
              return {};
            }
          })(),
          assetStorage.findTextFile(filePath),
        ]);
        if (!textFile) throw new Error(assetStorage.NotMarkdownError);
        let savedContent = await promises.readFile(pathUtilities.join(filePath, textFile), 'utf8');
        return (
          (File.bundle = {
            fileEncode: 'utf8',
            filePath: filePath,
            savedContent: savedContent,
            modifiedDate: new Date(),
            type: File.FileType.TextBundle,
            textFile: textFile,
          }),
          savedContent
        );
      },
    };
    moduleRecord.exports = assetStorage;
  },
);
