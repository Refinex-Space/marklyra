// media/asset-storage.
export default function initializeMediaAssetStorage(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    fileIntegration = requireModule('host/file-integration'),
    recovery = requireModule('document/recovery');
  const textBundleMetadata = {
    version: 2,
    type: 'net.daringfireball.markdown',
    transient: false,
    creatorIdentifier: 'io.appmakes.MarkLyra',
  };
  var assetStorage = {
    NotMarkdownError: 'NotMarkdown',
    quickGetContent: async function (filePath, throwOnError) {
      var promises = reqnode('fs').promises;
      try {
        var fileBytes = await promises.readFile(filePath);
        recovery.saveToRecover(fileBytes, 'overwrite');
        return fileBytes.toString('utf8');
      } catch (error) {
        if (throwOnError) {
          throw error;
        }
        return '';
      }
    },
    isFileSync: function (filePath) {
      try {
        let fileInfo = reqnode('fs').statSync(filePath);
        return fileInfo.isFile() || fileInfo.isDirectory() || /\.textbundle$/.exec(filePath);
      } catch (error) {
        return false;
      }
    },
    getTextFile: function () {
      if (File.bundle.filePath) {
        if (File.isTextBundle()) {
          return File.bundle.filePath + (File.isWin ? '\\' : '/') + File.bundle.textFile;
        } else {
          return File.bundle.filePath;
        }
      } else {
        return null;
      }
    },
    deletedAssetsMap: function () {
      if (File.isTextBundle()) {
        File.bundle.deletedAssetsMap = File.bundle.deletedAssetsMap || {};
        return File.bundle.deletedAssetsMap;
      } else {
        return {};
      }
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
            overwrite: true,
          });
          deletedAssets[assetName] = backupPath;
        }
      }
    },
    getAllUsedAssets: function (relativePaths) {
      var items = [];
      if (!File.isTextBundle() && !File.isTextPack()) {
        return new Set(items);
      }
      var writingArea = document.querySelector('#write'),
        elements = writingArea.querySelectorAll('[data-src]');
      elements.forEach((item) => {
        if (relativePaths) {
          let text = utilities.trimPathParam(item.dataset.src);
          if (/^assets[\/\\]/.exec(text)) {
            items.push(text.substring('assets/'.length));
          }
        } else {
          var absoluteImagePath = utilities.absolutePathFrom(
            File.editor.imgEdit.getRealSrc(item.dataset.src),
          );
          if (/^assets[\/\\]/.exec(item.dataset.src)) {
            items.push(absoluteImagePath);
          } else {
            if (assetStorage.shouldManageResource(absoluteImagePath)) {
              items.push(absoluteImagePath);
            }
          }
        }
      });
      (elements = writingArea.querySelectorAll('[src]')).forEach((element) => {
        if (!element.closest('[data-src]')) {
          var managedAssetName,
            absoluteResourcePath = utilities.absolutePathFrom(element.src);
          if (
            (managedAssetName = assetStorage.shouldManageResource(absoluteResourcePath)) &&
            relativePaths
          ) {
            items.push(managedAssetName);
          }
        }
      });
      writingArea.querySelectorAll('[href]').forEach((element) => {
        var linkTarget = element.getAttribute('href');
        if (relativePaths) {
          if (/^assets[\/\\]/.exec(linkTarget)) {
            linkTarget = utilities.trimPathParam(linkTarget);
            items.push(linkTarget.substring('assets/'.length));
          }
        } else {
          var absoluteLinkPath = utilities.ensureAbsolutePath(
            File.bundle.filePath || File.bundle.originalPath,
            linkTarget,
            true,
          );
          absoluteLinkPath = utilities.absolutePathFrom(absoluteLinkPath);
          if (/^assets[\/\\]/.exec(linkTarget)) {
            items.push(absoluteLinkPath);
          } else {
            if (assetStorage.shouldManageResource(absoluteLinkPath)) {
              items.push(absoluteLinkPath);
            }
          }
        }
      });
      return new Set(items.map(utilities.decodeFromEscapedPath));
    },
    findUnusedAssets: async function () {
      if (!File.isNode || !File.isTextBundle() || !File.bundle.filePath) {
        return [];
      }
      var usedAssets = assetStorage.getAllUsedAssets(),
        promises = reqnode('fs').promises,
        set = new Set(),
        filePath = File.isWin ? '\\' : '/',
        assetsDirectory = File.bundle.filePath + filePath + 'assets';
      try {
        (await promises.readdir(assetsDirectory)).forEach((item) => {
          if (!usedAssets.has(assetsDirectory + filePath + item)) {
            set.add(item);
          }
        });
      } catch (error) {}
      return set;
    },
    recordUnusedAssets: async function () {
      if (File.isNode) {
        const unusedAssets = await assetStorage.findUnusedAssets();
        File.bundle.unusedAssets = Array.from(unusedAssets || []);
      } else {
        var usedAssets = assetStorage.getAllUsedAssets(true);
        JSBridge.invoke('document.recordUnusedAssets', Array.from(usedAssets));
      }
    },
    removeUnusedAssets: async function () {
      if (!File.isNode || !File.isTextBundle()) {
        return;
      }
      const unusedAssets = await assetStorage.findUnusedAssets();
      await Promise.all(
        Array.from(unusedAssets).map((searchValue) => {
          if (-1 == (File.bundle.unusedAssets || []).indexOf(searchValue)) {
            return assetStorage.saveAssetsBeforeDelete(searchValue);
          }
        }),
      );
    },
    isEmptyFile: async function (filePath) {
      if (File.isNode) {
        try {
          var fileSystemExtra = reqnode('fs-extra'),
            fileInfo = await fileSystemExtra.stat(filePath);
          if (!/\.textbundle$/.exec(filePath)) {
            return 0 == fileInfo.size;
          }
          if (fileInfo.isDirectory()) {
            return (
              0 ==
              (fileInfo = await fileSystemExtra.stat(
                filePath + (File.isWin ? '\\' : '/') + 'text.md',
              )).size
            );
          }
        } catch (error) {
          console.warn(error);
        }
        return false;
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
            if (!/[\/\\]/.exec(textSlice)) {
              return textSlice;
            }
          }
        }
        return false;
      }
    },
    findTextFile: async function (separator) {
      var promises = reqnode('fs').promises,
        pathUtilities = reqnode('path');
      try {
        let directoryEntries = await promises.readdir(separator);
        for (var entryName of directoryEntries) {
          if (/^text\./.exec(entryName)) {
            var match = entryName.match(/(?:^|\.)([^.]+)$/);
            match = (match[1] || '').toLowerCase();
            if (
              ~File.SupportedTextFiles.indexOf(match) &&
              (await promises.stat(pathUtilities.join(separator, entryName))).isFile()
            ) {
              return entryName;
            }
          }
        }
        return null;
      } catch (error) {}
    },
    isTextBundle(filePath) {
      if (!filePath) {
        return false;
      }
      return 'textbundle' === fileIntegration.getExtension(filePath).toLowerCase();
    },
    isTextPack(filePath) {
      if (!filePath) {
        return false;
      }
      return 'textpack' === fileIntegration.getExtension(filePath).toLowerCase();
    },
    makeTextBundleSkeleton: async function (bundlePath) {
      const pathSeparator = File.isWin ? '\\' : '/',
        fileSystemExtra = reqnode('fs-extra');
      await fileSystemExtra.ensureDir(bundlePath + pathSeparator + 'assets');
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
      return true;
    },
    convertToTextBundleIfNeeded: async function () {
      if (File.isTextBundle() || File.isTextPack() || !File.isNode) {
        return;
      }
      File.bundle.type = File.FileType.TextBundle;
      if (!File.bundle.filePath) {
        return;
      }
      let filePath = File.bundle.filePath,
        basePath = File.bundle.filePath.replace(/\.[^.]+$/, ''),
        newPath = basePath + '.textbundle',
        fileSystem = reqnode('fs');
      !(function findAvailableBundlePath(collisionIndex) {
        if (collisionIndex > 0) {
          newPath = basePath + '-' + collisionIndex + '.textbundle';
        }
        if (fileSystem.existsSync(newPath)) {
          return findAvailableBundlePath(collisionIndex + 1);
        }
      })(0);
      assetStorage.makeTextBundleSkeleton(newPath);
      File.bundle.textFile = 'text.md';
      JSBridge.invoke('app.sendEvent', 'willRename', { oldPath: filePath });
      let backupPromise = recovery.saveFileToRecover();
      await File.saveAsUseNode(newPath);
      JSBridge.invoke('app.sendEvent', 'didRename', { oldPath: filePath, newPath: newPath });
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
      if (!textFile) {
        throw new Error(assetStorage.NotMarkdownError);
      }
      let savedContent = await promises.readFile(pathUtilities.join(filePath, textFile), 'utf8');
      File.bundle = {
        fileEncode: 'utf8',
        filePath: filePath,
        savedContent: savedContent,
        modifiedDate: new Date(),
        type: File.FileType.TextBundle,
        textFile: textFile,
      };
      return savedContent;
    },
  };
  moduleRecord.exports = assetStorage;
}
