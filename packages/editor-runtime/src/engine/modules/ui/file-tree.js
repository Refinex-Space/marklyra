// ui/file-tree.
export default function initializeUiFileTree(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(morphTreeNode, 'name', { value: 'h', configurable: true });
  Object.defineProperty(loadDirectoryEntry, 'name', { value: 'f', configurable: true });
  Object.defineProperty(loadDirectoryByNativeBridge, 'name', { value: 'm', configurable: true });
  Object.defineProperty(loadDirectoryByNode, 'name', { value: 'g', configurable: true });

  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    documentModel = requireModule('model/document-model'),
    fileIntegration =
      (documentModel.Node, documentModel.TYPE, requireModule('host/file-integration')),
    recovery = requireModule('document/recovery'),
    dialogs = ((utilities = requireModule('shared/utilities')), requireModule('ui/dialogs')),
    jquery = requireModule('libraries/jquery'),
    domMorph = requireModule('libraries/dom-morph'),
    renderState = false,
    currentPath = '_recent';
  function morphTreeNode(callbackElement, nextElement) {
    if (callbackElement.length && nextElement.length) {
      if (!callbackElement[0].parentElement) {
        return;
      }
      let childrenStateChanged =
        callbackElement.attr('data-has-sub') != nextElement.attr('data-has-sub');
      if (childrenStateChanged) {
        callbackElement.attr('data-has-sub', nextElement.attr('data-has-sub'));
      }
      domMorph(callbackElement[0], nextElement[0], {
        childrenOnly: !childrenStateChanged,
        getNodeKey: function (domNode) {
          return domNode.dataset && domNode.dataset.path;
        },
        onBeforeElUpdated: function (element, inputElement) {
          if (element.classList.contains('file-node-collapsed') && !childrenStateChanged) {
            inputElement.classList.add('file-node-collapsed');
            inputElement.classList.remove('file-node-expanded');
          }
        },
      });
    }
  }
  var statWrapper = fileIntegration.statWrapper;
  function loadDirectoryEntry(entry, traversalContext) {
    if (File.isMac) {
      return new Promise(function (resolvePromise) {
        loadDirectoryByNativeBridge(entry, resolvePromise);
      });
    } else {
      return loadDirectoryByNode(entry, false, traversalContext);
    }
  }
  function loadDirectoryByNativeBridge(entry, onLoaded) {
    if (!entry.path) {
      return onLoaded(null);
    }
    bridge.callHandler('library.listDocsUnder', entry.path, function (directoryData) {
      if (!directoryData || !directoryData.name) {
        return onLoaded(null);
      }
      var mappedItems;
      entry.fetched = true;
      entry.subdir = directoryData.subdir;
      entry.lastModified = directoryData.lastModified;
      entry.createDate = directoryData.createDate;
      entry.alias = directoryData.alias;
      ((mappedItems = entry.subdir.map(function (item, itemIndex) {
        return new Promise(function (resolvePromise) {
          if (item.isOpen) {
            item.fetched = true;
            resolvePromise();
          } else {
            if (
              document.querySelector(
                ".file-node-expanded.file-tree-node[data-path='" +
                  utilities.escapeSelector(item.path) +
                  "']",
              )
            ) {
              loadDirectoryByNativeBridge(item, function (childEntry) {
                entry.subdir[itemIndex] = childEntry;
                if (entry.subdir[itemIndex]) {
                  entry.subdir[itemIndex].isOpen = true;
                }
                resolvePromise();
              });
            } else {
              resolvePromise();
            }
          }
        });
      })),
      mappedItems && mappedItems.length ? Promise.all(mappedItems) : Promise.resolve()).then(
        function () {
          entry.content = directoryData.content;
          entry.isDirectory = directoryData.isDirectory;
          entry.isFile = directoryData.isFile;
          entry.name = directoryData.name;
          if (onLoaded) {
            onLoaded(entry);
          }
        },
      );
    });
  }
  function loadDirectoryByNode(entry, shallow, traversalContext) {
    var fileSystemPlus = reqnode('fs-plus'),
      pathUtilities = reqnode('path'),
      pathSeparator = File.isWin ? '\\' : '/';
    return new Promise(function (resolvePromise, rejectPromise) {
      var path = entry.path;
      entry.name = pathUtilities.basename(path) || path;
      entry.subdir = [];
      entry.content = [];
      entry.fetched = !shallow;
      if ('.' == entry.name[0] && !entry.isOpen) {
        return resolvePromise();
      }
      statWrapper(path, function (fileInfo) {
        if (!fileInfo || fileInfo.shouldIgnore) {
          return resolvePromise();
        }
        entry.isDirectory = fileInfo.isDir;
        entry.isFile = fileInfo.isFile;
        if (
          File.option.supportTextBundle &&
          entry.isDirectory &&
          /\.textbundle$/.exec(entry.name)
        ) {
          entry.type = File.FileType.TextBundle;
          entry.isDirectory = false;
          entry.isFile = true;
        }
        if (File.option.supportTextPack && !entry.isDirectory && /\.textpack$/.exec(entry.name)) {
          entry.type = File.FileType.TextPack;
          entry.isDirectory = false;
          entry.isFile = true;
        }
        entry.lastModified = fileInfo.mtime;
        entry.createDate = fileInfo.birthtime;
        if (fileInfo.isFile) {
          entry.fetched = true;
          if (fileIntegration.isSupportedFile(entry.name)) {
            return resolvePromise(entry);
          } else {
            return resolvePromise();
          }
        }
        if (fileInfo.isDir) {
          if (
            (function (filePath) {
              return (
                File.bundle.filePath &&
                filePath &&
                0 == File.bundle.filePath.indexOf(filePath.replace(/[\/\\]$/, '') + pathSeparator)
              );
            })(path)
          ) {
            entry.isOpen = true;
          } else {
            if (shallow) {
              return resolvePromise(entry);
            }
          }
          fileSystemPlus.list(path, void 0, function (readError, items) {
            if (readError) {
              return resolvePromise();
            }
            if (!entry.isOpen) {
              if (
                document.querySelector(
                  ".file-node-expanded.file-tree-node[data-path='" +
                    utilities.escapeSelector(path) +
                    "']",
                )
              ) {
                entry.isOpen = true;
              }
            }
            Promise.all(
              items.map(function (inputPath) {
                return loadDirectoryByNode({ path: inputPath }, !entry.isOpen, traversalContext);
              }),
            ).then(function (inputItems) {
              entry.fetched = true;
              if ('oversize' != renderState) {
                File.editor.library.addWatchByUnix(entry.path);
              }
              if (entry.subdir.length + entry.content.length > 0) {
                resolvePromise(entry);
              } else {
                inputItems.forEach(function (item) {
                  if (item) {
                    if (item.isDirectory) {
                      entry.subdir.push(item);
                    } else {
                      entry.content.push(item);
                    }
                  }
                });
                resolvePromise(entry);
              }
            });
          });
        }
      });
    });
  }
  moduleRecord.exports = class {
    constructor(parent) {
      this.parent = parent;
      this.editor = parent.editor;
      this.$template = jquery(document.querySelector('#file-library-node-template').textContent);
      this.root;
      this.noGroup = File.option.treeNoGroup || false;
      this.sortType = File.option.treeSortType;
    }
    getRoot() {
      return this.parent.root;
    }
    setRoot(root) {
      return (this.parent.root = root);
    }
    renderNode(entry, noGroup) {
      if (!entry) {
        return jquery();
      }
      var element = this.$template.clone(),
        parent = this.parent;
      if (!(this.noGroup || noGroup)) {
        if (entry.subdir) {
          entry.subdir.sort(parent.compareItem.bind(parent));
        }
        if (entry.content) {
          entry.content.sort(parent.compareItem.bind(parent));
        }
      }
      if (entry == this.getRoot()) {
        entry.isOpen = true;
        element.find('.file-node-open-state').remove();
      } else {
        if (entry.isDirectory && entry.subdir && (entry.subdir.length || entry.content.length)) {
          element
            .attr('data-has-sub', 'true')
            .addClass(entry.isOpen ? 'file-node-expanded' : 'file-node-collapsed');
        }
      }
      var substringLength = entry.name.lastIndexOf('.');
      if (substringLength < 0 || entry.isDirectory) {
        substringLength = entry.name.length;
      }
      element.find('.file-node-title-name-part').text(entry.name.substr(0, substringLength));
      element.find('.file-node-title-ext-part').text(entry.name.substr(substringLength));
      element.attr('data-path', entry.path).attr('data-is-directory', entry.isDirectory);
      element.find('.file-node-icon').addClass(
        function (entry) {
          if (entry == this.getRoot()) {
            if (entry.path == currentPath) {
              return 'fa fa-history';
            } else {
              return 'fa fa-folder';
            }
          } else {
            if (entry.isDirectory) {
              return 'fa fa-folder';
            } else {
              if (entry.type == File.FileType.TextBundle) {
                return 'marklyra-icon marklyra-textbundle';
              } else {
                if (entry.type == File.FileType.TextPack) {
                  return 'marklyra-icon marklyra-textbundle';
                } else {
                  return 'fa fa-file-text-o';
                }
              }
            }
          }
        }.call(this, entry),
      );
      element.find('.file-node-title').attr('title', utilities.abbreviatingWithTilde(entry.path));
      if (!entry.isDirectory) {
        element.addClass('file-library-file-node');
      }
      if (entry == this.getRoot()) {
        element.addClass('file-node-root');
      } else {
        if (!(entry.isDirectory || entry.path != fileIntegration.getCurrentFilePath())) {
          element.addClass('active');
        }
      }
      if (entry.isDirectory) {
        var elements = element.find('.file-node-children');
        elements.html('');
        if (entry.isOpen && entry.fetched) {
          if (this.noGroup) {
            let items = (entry.subdir || []).concat(entry.content || []);
            items.sort(parent.compareItem.bind(parent));
            items.forEach(function (item) {
              elements.append(this.renderNode(item));
            }, this);
          } else {
            entry.subdir.forEach(function (item) {
              elements.append(this.renderNode(item));
            }, this);
            entry.content.forEach(function (item) {
              elements.append(this.renderNode(item));
            }, this);
          }
        }
      }
      return element;
    }
    renderIfNeed() {
      return (
        !renderState &&
        (this.render(), File.isNode && this.parent.addWatch(File.getMountFolder()), true)
      );
    }
    render(forceRefresh) {
      renderState = true;
      var receiver = this,
        mountFolder = File.getMountFolder();
      (receiver.getRoot()
        ? Promise.resolve(receiver.getRoot())
        : new Promise(function (resolvePromise) {
            receiver.parent.calcMountFolder().then(function (path) {
              receiver.parent.root = { path: path, isOpen: true };
              if (path) {
                loadDirectoryEntry(receiver.parent.root, receiver).then(function (root) {
                  receiver.parent.root = root;
                  resolvePromise(root);
                  receiver.parent.silent = false;
                });
              } else {
                resolvePromise(null);
              }
            });
          })
      ).then(function (result) {
        if (result && result.path) {
          if (forceRefresh || 1 == renderState) {
            (function () {
              renderState = 'complete';
              jquery('#file-library-tree')
                .html('')
                .append(this.renderNode(this.getRoot()))
                .attr('data-state', '');
              this.parent.markCurrentFile();
            }).call(receiver);
          }
        } else {
          jquery('#file-library-tree').html('');
          receiver.parent.onLoadFolderFailed(!mountFolder);
        }
      });
      jquery('#file-library-tree').attr('data-state', 'rendering').html('');
    }
    findElemFromPath(path) {
      path = (this.findNodeFromPath(path) || {}).path;
      return jquery(".file-tree-node[data-path='" + utilities.escapeSelector(path) + "']");
    }
    focusToFile(text, unusedParameter2, skipMarkActive, onFocused) {
      if (this.getRoot() && text && true !== renderState) {
        var searchValue = File.getMountFolder(),
          pathSeparator = File.isWin ? '\\' : '/',
          receiver = this,
          innerHeight = window.innerHeight,
          scrollContainer = File.isMac ? jquery('.sidebar-content') : jquery('#file-library'),
          scrollOffset = scrollContainer.scrollTop();
        if (0 === text.indexOf(searchValue)) {
          Object.defineProperty(
            function expandPathSegments(currentPath, pathSegments) {
              if (0 != pathSegments.length) {
                if (1 == pathSegments.length) {
                  var fileElement = skipMarkActive
                    ? receiver.findElemFromPath(text)
                    : receiver.markOpenedFile(text);
                  !(function (itemElement) {
                    if (itemElement.length) {
                      var offsetTop = itemElement[0].offsetTop;
                      if (offsetTop < scrollOffset) {
                        scrollOffset = offsetTop;
                        scrollContainer.scrollTop(scrollOffset);
                      } else {
                        if (offsetTop - scrollOffset > innerHeight - 200) {
                          scrollOffset = offsetTop - innerHeight + 300;
                          scrollContainer.scrollTop(scrollOffset);
                        }
                      }
                    }
                  })(fileElement);
                  if (0 == scrollContainer.scrollTop()) {
                    setTimeout(function () {
                      if (!(0 != scrollContainer.scrollTop() || scrollOffset)) {
                        scrollContainer.scrollTop(scrollOffset);
                      }
                    }, 200);
                  }
                  if (onFocused) {
                    onFocused(fileElement);
                  }
                } else {
                  currentPath = (currentPath + pathSeparator + pathSegments.shift()).replace(
                    /[\\]+/,
                    '\\',
                  );
                  receiver.expandNode(
                    receiver.findElemFromPath(currentPath),
                    currentPath,
                    function () {
                      expandPathSegments(currentPath, pathSegments);
                    },
                  );
                }
              }
            },
            'name',
            { value: 't', configurable: true },
          )(
            searchValue,
            text
              .substr(searchValue.length)
              .replace(/^[\\/]+/g, '')
              .split(/[\\/]+/) || [],
          );
        }
      }
    }
    highlight(filePath) {
      var receiver = this;
      this.focusToFile(filePath, false, true, function (element) {
        element.addClass('blink-area');
        setTimeout(function () {
          element.removeClass('blink-area');
        }, 2e3);
        if (element.length) {
          receiver.parent.nextChangeHighlight = null;
        }
      });
    }
    markOpenedFile(filePath) {
      return this.parent.markOpenedFile(filePath).filter('.file-tree-node');
    }
    needRepaint() {
      renderState = false;
    }
    findNodeFromPath(filePath, items) {
      if (filePath && this.getRoot()) {
        items = items || [];
        return Object.defineProperty(
          function findEntryWithAncestors(entry, targetPath) {
            if (entry) {
              if (utilities.isSamePath(entry.path, targetPath)) {
                return entry;
              }
              items.push(entry);
              for (var itemIndex = 0; itemIndex < (entry.subdir || []).length; itemIndex++) {
                var childEntry = entry.subdir[itemIndex];
                if (childEntry) {
                  if (utilities.isSamePath(childEntry.path, targetPath)) {
                    childEntry.folderPath = entry.path;
                    return childEntry;
                  }
                  if (utilities.isAncestorPathOf(childEntry.path, targetPath)) {
                    return findEntryWithAncestors(childEntry, targetPath);
                  }
                }
              }
              var elements = entry.content.find(function (item) {
                return utilities.isSamePath(item.path, targetPath);
              });
              if (elements) {
                elements.folderPath = entry.path;
              }
              return elements;
            }
            return null;
          },
          'name',
          { value: 'e', configurable: true },
        )(this.getRoot(), filePath);
      }
    }
    expand(filePath, elementOverride, onExpanded) {
      var element;
      if (
        (1 !=
          (element = elementOverride ? jquery(elementOverride) : this.findElemFromPath(filePath))[0]
            .dataset.hasSub &&
          'true' != element[0].dataset.hasSub) ||
        !element.hasClass('file-node-collapsed')
      ) {
        if (onExpanded) {
          onExpanded();
        }
        return false;
      } else {
        this.expandNode(element, filePath, onExpanded);
        return true;
      }
    }
    expandNode(element, filePath, onExpanded) {
      if (true !== renderState) {
        var entry = this.findNodeFromPath(filePath, []),
          receiver = this;
        if (entry) {
          entry.isOpen = true;
          if (element.children('.file-node-children').children().length) {
            element.removeClass('file-node-collapsed').addClass('file-node-expanded');
          } else {
            if (
              (!entry.fetched || (entry.subdir.length > 0 && !entry.subdir[0].fetched)) &&
              element.length &&
              element[0].parentElement
            ) {
              loadDirectoryEntry(entry, receiver).then(function (result) {
                if (result && element.length && element[0].parentElement) {
                  element.replaceWith(receiver.renderNode(result));
                  if (!jquery('.file-library-node.active').length) {
                    receiver.markOpenedFile(fileIntegration.getCurrentFilePath());
                  }
                  if (onExpanded) {
                    onExpanded();
                  }
                }
              });
            } else {
              element.replaceWith(this.renderNode(entry));
            }
          }
          if (!jquery('.file-library-node.active').length) {
            this.markOpenedFile(fileIntegration.getCurrentFilePath());
          }
          if (onExpanded) {
            onExpanded();
          }
        }
      }
    }
    setSortType(sortType) {
      this.sortType = sortType;
      JSBridge.putSetting('treeSortType', sortType);
      if ('complete' === renderState && this.getRoot() && this.getRoot().fetched) {
        this.render(true);
      }
    }
    setGroupByFolder(noGroup) {
      if (noGroup) {
        jquery('#marklyra-group-by-folder-btn').removeClass('active');
      } else {
        jquery('#marklyra-group-by-folder-btn').addClass('active');
      }
      if ('complete' === renderState && this.noGroup != noGroup) {
        this.noGroup = noGroup;
        this.render(true);
        JSBridge.putSetting('treeNoGroup', noGroup);
      }
    }
    onChangeForMac(items) {
      Object.defineProperty(refreshTreeEntry, 'name', { value: 'u', configurable: true });
      Object.defineProperty(highlightChangedEntry, 'name', { value: 'p', configurable: true });
      Object.defineProperty(removeTreeEntry, 'name', { value: 'f', configurable: true });
      Object.defineProperty(addDiscoveredEntry, 'name', { value: 'g', configurable: true });

      if (renderState) {
        var changedEntry,
          ancestors = [],
          set = new Set(),
          currentSet = new Set(),
          receiver = this,
          sortByDate = this.parent.dateAffectsSort(),
          renamingPath = jquery('.file-node-on-edit').attr('data-path');
        items.forEach(function (item) {
          changedEntry = this.findNodeFromPath(item.path, ancestors);
          if ((item.oldPath || item.path) != renamingPath && this.getRoot()) {
            if ('removed' == item.type) {
              if (item.path == this.getRoot().path) {
                this.parent.root = null;
              } else {
                if (changedEntry && ancestors.length) {
                  removeTreeEntry.call(this, changedEntry, ancestors.last());
                }
              }
            } else {
              if ('rename' == item.type) {
                if (item.oldPath == this.getRoot().path) {
                  return void (this.parent.root = null);
                }
                ancestors = [];
                changedEntry = this.findNodeFromPath(item.oldPath, ancestors);
                removeTreeEntry.call(this, changedEntry, ancestors.last());
                addDiscoveredEntry(item.newPath, item.isDir);
              } else {
                if ('created' == item.type && changedEntry != this.getRoot()) {
                  if (changedEntry) {
                    if (sortByDate) {
                      changedEntry.lastModified = new Date();
                      this.onRemoveFile(changedEntry);
                      this.onAddFile(changedEntry);
                    } else {
                      set.add(ancestors.last());
                    }
                  } else {
                    if (item.isDir || (item.path && !/~\.[^.]+$/.exec(item.path))) {
                      addDiscoveredEntry(item.path, item.isDir);
                    }
                  }
                }
              }
            }
          }
        }, this);
        if (this.getRoot()) {
          receiver = this;
          currentSet.forEach(function (item) {
            loadDirectoryByNativeBridge(item, function (updatedEntry) {
              if (updatedEntry) {
                refreshTreeEntry.call(receiver, updatedEntry);
              }
            });
            set.delete(item);
          }, this);
          set.forEach(function (item) {
            refreshTreeEntry.call(this, item);
          }, this);
        } else {
          this.parent.onRootChanged();
        }
      }
      function refreshTreeEntry(entry) {
        var element = receiver.findElemFromPath(entry.path),
          previousScrollTop = null;
        if (element.hasClass('file-node-root')) {
          previousScrollTop = jquery('.sidebar-content').scrollTop();
        }
        morphTreeNode(element, receiver.renderNode(entry));
        if (previousScrollTop) {
          jquery('.sidebar-content').scrollTop(previousScrollTop);
        }
        highlightChangedEntry(entry.path);
      }
      function highlightChangedEntry(searchValue) {
        var nextChangeHighlight = receiver.parent.nextChangeHighlight;
        if (nextChangeHighlight && 0 == nextChangeHighlight.indexOf(searchValue)) {
          receiver.highlight(nextChangeHighlight);
        }
      }
      function removeTreeEntry(entry, parentEntry) {
        if (entry) {
          receiver.findElemFromPath(entry.path).remove();
          receiver.parent.unwatchByUnix(entry.path);
          if (entry.isDirectory) {
            parentEntry.subdir.remove(entry);
          } else {
            parentEntry.content.remove(entry);
          }
          if (parentEntry.subdir.length + parentEntry.content.length == 0) {
            entry.isOpen = false;
            refreshTreeEntry.call(this, parentEntry);
          }
        }
      }
      function addDiscoveredEntry(filePath, isDirectory) {
        var parentPath = utilities.pathByDeleteLastComponent(filePath),
          parentEntry = receiver.findNodeFromPath(parentPath);
        if (!receiver.findNodeFromPath(filePath)) {
          if (parentEntry) {
            (function (path, parentEntry, isDirectory) {
              if (parentEntry.fetched && !currentSet.has(parentEntry)) {
                var newEntry;
                if (File.option.supportTextBundle && /\.textbundle$/.exec(path)) {
                  isDirectory = false;
                }
                if (parentEntry.content.length + parentEntry.subdir.length == 0) {
                  currentSet.add(parentEntry);
                }
                if (isDirectory) {
                  if (
                    parentEntry.subdir.findIndex(function (item) {
                      return item.path == path;
                    }) > -1
                  ) {
                    return;
                  }
                  currentSet.add(parentEntry);
                } else {
                  if (
                    parentEntry.content.findIndex(function (item) {
                      return item.path == path;
                    }) > -1
                  ) {
                    return;
                  }
                  newEntry = {
                    path: path,
                    isDirectory: false,
                    name: path.split('/').last(),
                    lastModified: new Date(),
                    createDate: new Date(),
                  };
                  parentEntry.content.push(newEntry);
                }
                set.add(parentEntry);
              }
            }).call(receiver, filePath, parentEntry, isDirectory);
          }
          highlightChangedEntry(filePath);
        }
      }
    }
    isPathTooDeepToDisplay(text, ancestors) {
      ancestors = ancestors || [];
      this.findNodeFromPath(text, ancestors);
      return (
        !ancestors.length ||
        !!text
          .substr(ancestors.last().path.length)
          .replace(/^[\\/]+/, '')
          .match(/[\\/]/)
      );
    }
    onChangeForWin(searchValue, items, eventType) {
      Object.defineProperty(removeMissingEntry, 'name', { value: 's', configurable: true });

      if (
        renderState &&
        !this.parent.isSuppressOnChange() &&
        !this.parent.shouldIgnore(searchValue)
      ) {
        var renamingPath = jquery('.file-node-on-edit').attr('data-path');
        if (searchValue != renamingPath) {
          var ancestors = [],
            pathSeparator = File.isWin ? '\\' : '/',
            receiver = this;
          if (!this.isPathTooDeepToDisplay(searchValue, ancestors)) {
            (function (inputPath, ancestors, onUpdated) {
              ancestors = ancestors || [];
              if (
                !items.find(function (item) {
                  return item == inputPath || 0 == inputPath.indexOf(item + pathSeparator);
                })
              ) {
                items.push(inputPath);
                var directoryPath = reqnode('path').dirname(inputPath),
                  parentEntry = receiver.findNodeFromPath(directoryPath);
                if (parentEntry && parentEntry.fetched) {
                  var shallow = !parentEntry.isOpen;
                  if ('unlink' != eventType) {
                    loadDirectoryByNode({ path: inputPath }, shallow, receiver).then(
                      function (result) {
                        if (result) {
                          (function (path, updatedEntry, parentEntry) {
                            var existingEntry = receiver.findNodeFromPath(path);
                            if (existingEntry && existingEntry.fetched) {
                              if (existingEntry.path != path) {
                                receiver
                                  .findElemFromPath(existingEntry.path)
                                  .replaceWith(receiver.renderNode(updatedEntry));
                                existingEntry.path = updatedEntry.path;
                                existingEntry.name = updatedEntry.name;
                              }
                            } else {
                              receiver.onAddFile(updatedEntry, parentEntry);
                            }
                          })(inputPath, result, parentEntry);
                          if (onUpdated) {
                            onUpdated();
                          }
                        } else {
                          removeMissingEntry(inputPath, ancestors);
                        }
                      },
                    );
                  } else {
                    removeMissingEntry(inputPath, ancestors);
                  }
                }
              }
            })(searchValue, ancestors, function () {
              if (receiver.parent.useTreeStyle) {
                var nextChangeHighlight = receiver.parent.nextChangeHighlight;
                if (nextChangeHighlight && 0 == nextChangeHighlight.indexOf(searchValue)) {
                  receiver.highlight(nextChangeHighlight);
                }
              }
            });
          }
        }
      }
      function removeMissingEntry(filePath, ancestors) {
        receiver.onRemoveFile(filePath, (ancestors || []).last());
      }
    }
    onFileUpdated(filePath) {
      var entry = this.findNodeFromPath(filePath);
      if (entry) {
        entry.lastModified = new Date();
        if (this.parent.dateAffectsSort()) {
          this.onRemoveFile(entry);
          this.onAddFile(entry);
        }
      }
    }
    onRemoveFile(entryOrPath, parentOverride) {
      var entry, path;
      if ('string' == typeof entryOrPath) {
        path = entryOrPath;
        entry = this.findNodeFromPath(path);
      } else {
        if (entryOrPath && entryOrPath.path) {
          path = (entry = entryOrPath).path;
        }
      }
      if (entry) {
        var parentEntry = parentOverride || this.findNodeFromPath(entry.folderPath);
        this.findElemFromPath(path).remove();
        if (!parentEntry) {
          return;
        }
        parentEntry.subdir.removeIf(function (childEntry) {
          return utilities.isSamePath(childEntry.path, entry.path);
        });
        parentEntry.content.removeIf(function (childEntry) {
          return utilities.isSamePath(childEntry.path, entry.path);
        });
        if (parentEntry.subdir.length + parentEntry.content.length == 0) {
          this.findElemFromPath(parentEntry.path).replaceWith(this.renderNode(parentEntry));
        }
      }
    }
    onAddFile(searchValue, parentOverride) {
      var parentEntry = parentOverride || this.findNodeFromPath(searchValue.folderPath),
        wasEmpty = parentEntry.content.length + parentEntry.subdir.length == 0,
        items = searchValue.isDirectory ? parentEntry.subdir : parentEntry.content;
      items.splice(0, 0, searchValue);
      items.sort(this.parent.compareItem.bind(this.parent));
      var insertionIndex = items.indexOf(searchValue);
      if (!searchValue.isDirectory) {
        insertionIndex += parentEntry.subdir.length;
      }
      if (wasEmpty) {
        this.findElemFromPath(parentEntry.path).replaceWith(this.renderNode(parentEntry));
      } else {
        var childrenElement = this.findElemFromPath(parentEntry.path).children(
          '.file-node-children',
        );
        if (parentEntry.isOpen || childrenElement.children().length) {
          var itemElement = this.renderNode(searchValue)[0];
          if (childrenElement[0]) {
            childrenElement[0].insertChildAtIndex(itemElement, insertionIndex);
          }
          return itemElement;
        }
      }
    }
    newFile(folderPath) {
      this.newFileCommand(this.findElemFromPath(folderPath), false);
    }
    newFolderCommand(targetElement) {
      this.newFileCommand(targetElement, true);
    }
    newFileCommand(targetElement, createDirectory) {
      Object.defineProperty(appendCreatedEntry, 'name', { value: 'c', configurable: true });
      Object.defineProperty(createEntryInFolder, 'name', { value: 'd', configurable: true });

      var element = this.editor.getJQueryElem(targetElement).closest('.file-library-node'),
        folderPath = element.attr('data-path'),
        targetIsDirectory = 'true' == element.attr('data-is-directory'),
        receiver = this;
      async function appendCreatedEntry(parentEntry, parentElement, newEntry, isFile) {
        if (!parentElement.parent().length) {
          parentElement = receiver.findElemFromPath(parentEntry.path);
        }
        if (isFile) {
          parentEntry.content.push(newEntry);
          if (receiver.parent.isDiscardableUntitled()) {
            await new Promise((resolvePromise) => {
              receiver.parent.openFile(newEntry.path, resolvePromise);
            });
            morphTreeNode(parentElement, receiver.renderNode(parentEntry, true));
            receiver.focusToFile(newEntry.path);
            return void setTimeout(function () {
              receiver.parent.markCurrentFile();
              receiver.parent.resumeOnChange();
              receiver.renameFileCommand(receiver.findElemFromPath(newEntry.path)[0], true);
            }, 10);
          }
        } else {
          parentEntry.subdir.push(newEntry);
        }
        morphTreeNode(parentElement, receiver.renderNode(parentEntry, true));
        receiver.renameFileCommand(receiver.findElemFromPath(newEntry.path)[0], true);
      }
      function createEntryInFolder() {
        var parentEntry = this.findNodeFromPath(folderPath);
        if (parentEntry) {
          var name = (function (parentEntry, createDirectory) {
              var untitledIndex = 0;
              if (createDirectory) {
                parentEntry.subdir.forEach(function (item) {
                  if (item) {
                    var match = /^untitled folder( (\d+))?$/i.exec(item.name);
                    if (match) {
                      untitledIndex = Math.max(untitledIndex, (match[2] || 0) - 0 + 1);
                    }
                  }
                });
                return 'Untitled Folder' + (untitledIndex ? ' ' + untitledIndex : '');
              } else {
                parentEntry.content.forEach(function (item) {
                  var match = /^untitled( (\d+))?\./i.exec(item.name);
                  if (match) {
                    untitledIndex = Math.max(untitledIndex, (match[2] || 0) - 0 + 1);
                  }
                });
                return (
                  'Untitled' +
                  (untitledIndex ? ' ' + untitledIndex : '') +
                  '.' +
                  File.FileOption.getDefaultExtension()
                );
              }
            })(parentEntry, createDirectory),
            fileSystem = File.isNode && reqnode('fs');
          try {
            var parentElement = this.findElemFromPath(folderPath),
              path = folderPath + (File.isWin ? '\\' : '/') + name,
              newEntry = {
                fetched: true,
                subdir: [],
                content: [],
                isDirectory: !!createDirectory,
                folderPath: folderPath,
                isFile: !createDirectory,
                name: name,
                path: path,
              };
            receiver.parent.pauseOnChange(true);
            if (createDirectory) {
              if (File.isNode) {
                fileSystem.mkdir(path, function (createError) {
                  if (createError) {
                    receiver.parent.resumeOnChange();
                  } else {
                    appendCreatedEntry(parentEntry, parentElement, newEntry, false);
                  }
                });
              } else {
                bridge.callHandler('library.newFolder', path, function (created) {
                  if (created) {
                    appendCreatedEntry(parentEntry, parentElement, newEntry, false);
                  } else {
                    receiver.parent.resumeOnChange();
                  }
                });
              }
            } else {
              if (File.isNode) {
                fileSystem.writeFile(path, '', function (inputError) {
                  if (inputError) {
                    dialogs.showErrorDialog(
                      jquery.localize.getString('Operation Failed'),
                      inputError,
                    );
                    console.error(inputError);
                    receiver.parent.resumeOnChange();
                  } else {
                    appendCreatedEntry(parentEntry, parentElement, newEntry, true);
                  }
                });
              } else {
                bridge.callHandler('library.newFile', path, function (created) {
                  if (created) {
                    appendCreatedEntry(parentEntry, parentElement, newEntry, true);
                  } else {
                    receiver.parent.resumeOnChange();
                  }
                });
              }
            }
          } catch (error) {
            receiver.parent.resumeOnChange();
          }
        }
      }
      if (!folderPath) {
        element = jquery('#file-library-tree .file-node-root');
        folderPath = element.attr('data-path');
        targetIsDirectory = true;
      }
      if (folderPath) {
        if (!targetIsDirectory) {
          folderPath = utilities.pathByDeleteLastComponent(folderPath);
        }
        if (targetIsDirectory) {
          receiver = this;
          this.expandNode(element, folderPath, function () {
            createEntryInFolder.call(receiver);
          });
        } else {
          createEntryInFolder.call(this);
        }
      }
    }
    renameFileCommand(targetElement, newlyCreated, renameCompatibilityFlag) {
      Object.defineProperty(finishInlineRename, 'name', { value: 'g', configurable: true });
      Object.defineProperty(applyEntryRename, 'name', { value: 'v', configurable: true });

      jquery('.file-node-on-edit').removeClass('file-node-on-edit');
      var element = this.editor
          .getJQueryElem(targetElement)
          .closest('.file-library-node')
          .addClass('file-node-on-edit'),
        old = element.attr('data-path'),
        currentElement = element.children('.file-node-content').children('.file-tree-rename-div'),
        trimmedText = currentElement.prev().text().trim(),
        localElement = currentElement.children('input').val(trimmedText),
        receiver = this;
      if (currentElement.length) {
        var inputWidth = jquery('#sidebar-content').width() - 48 - currentElement[0].offsetLeft;
        inputWidth = Math.min(inputWidth, 200);
        inputWidth = Math.max(inputWidth, 140);
        localElement.width(inputWidth);
        currentElement.closest('.file-node-content').attr('draggable', 'false');
        var isDirectory = 'true' === element.attr('data-is-directory');
        this.parent.bindRename(
          localElement,
          function (inputElement) {
            if (File.isMac) {
              (function (inputElement) {
                var currentTrimmedText = inputElement
                    .val()
                    .replace(/[\/\\]/g, '')
                    .trim(),
                  newValue = utilities.pathByDeleteLastComponent(old) + '/' + currentTrimmedText;
                receiver.parent.pauseOnChange(true);
                var wasCurrentFile = old == fileIntegration.getCurrentFilePath();
                if (old != newValue) {
                  bridge.callHandler(
                    'library.renameFile',
                    { old: old, new: newValue },
                    function (renamed) {
                      if (renamed) {
                        var entry = receiver.findNodeFromPath(old);
                        if (!entry) {
                          return;
                        }
                        applyEntryRename(entry, newValue, currentTrimmedText);
                        if (wasCurrentFile) {
                          console.debug('update marked file');
                          setTimeout(function () {
                            receiver.parent.markOpenedFile(newValue, true);
                            receiver.focusToFile(newValue);
                          }, 200);
                        }
                        receiver.parent.scheduleChangeHighlight(newValue);
                      } else {
                        inputElement.val(trimmedText);
                      }
                    },
                  );
                } else {
                  inputElement.val(trimmedText);
                }
                element.removeClass('file-node-on-edit');
                receiver.editor.restoreLastCursor();
              })(inputElement);
            } else {
              (function (inputElement) {
                Object.defineProperty(reportRenameFailure, 'name', {
                  value: 'f',
                  configurable: true,
                });

                var currentTrimmedText = inputElement.val().trim();
                if (
                  (currentTrimmedText = File.isWin
                    ? currentTrimmedText
                        .replace(/[\\\/:*?"<>\|\000-\031]/g, '')
                        .replace(/\.+$/, '')
                        .trim()
                    : currentTrimmedText.replace(/[\/\\\000-\031]/g, ''))
                ) {
                  receiver.parent.pauseOnChange();
                  var newPath =
                    utilities.pathByDeleteLastComponent(old) +
                    (File.isWin ? '\\' : '/') +
                    currentTrimmedText;
                  newPath = newPath.trim();
                  inputElement.closest('.file-node-on-edit').removeClass('file-node-on-edit');
                  var containsCurrentFile =
                      File.bundle.filePath && utilities.isAncestorPathOf(old, File.bundle.filePath),
                    fileSystemExtra = reqnode('fs-extra');
                  if (utilities.isSamePath(old, newPath) || !fileSystemExtra.existsSync(newPath)) {
                    JSBridge.invoke('app.sendEvent', 'willRename', { oldPath: old });
                    receiver.parent.execRenameFileByNode(old, newPath).then(function ([
                      renameError,
                    ]) {
                      element.removeClass('file-node-on-edit');
                      receiver.editor.restoreLastCursor();
                      if (renameError) {
                        newPath = old;
                      }
                      JSBridge.invoke('app.sendEvent', 'didRename', {
                        oldPath: old,
                        newPath: newPath,
                      });
                      var pathUtilities = reqnode('path');
                      receiver.parent.resumeOnChange();
                      var fileName = pathUtilities.basename(newPath),
                        entry = receiver.findNodeFromPath(old);
                      if (entry) {
                        applyEntryRename(entry, newPath, fileName);
                        if (renameError) {
                          reportRenameFailure(renameError);
                        } else {
                          console.debug('renamed');
                          if (!newlyCreated) {
                            JSBridge.invoke(
                              'filesOp.registerUndo',
                              newPath,
                              old,
                              jquery.localize
                                .getString('Rename %@', 'Panel')
                                .replace('%@', pathUtilities.basename(old)),
                            );
                            receiver.parent.scheduleChangeHighlight(newPath);
                          }
                          if (!File.bundle.filePath) {
                            return;
                          }
                        }
                      }
                    });
                  } else {
                    reportRenameFailure(
                      jquery.localize.getString(
                        'File with same name already exists at target path.',
                      ),
                    );
                  }
                } else {
                  finishInlineRename();
                }
                function reportRenameFailure(errorMessage) {
                  dialogs.showErrorDialog(
                    jquery.localize.getString('Rename Failed'),
                    jquery.localize
                      .getString('Failed to rename from "{0}" to "{1}"')
                      .format(trimmedText, currentTrimmedText) +
                      '\n' +
                      errorMessage,
                  );
                  console.debug(errorMessage);
                  if (containsCurrentFile) {
                    recovery.watchFileChange(File.bundle.filePath);
                  }
                  JSBridge.invoke('filesOp.clearUndo');
                }
              })(inputElement);
            }
          },
          finishInlineRename,
          isDirectory,
          false,
          renameCompatibilityFlag,
          utilities.pathByDeleteLastComponent(old),
        );
        localElement.focus();
      }
      function finishInlineRename() {
        localElement.closest('.file-node-on-edit').removeClass('file-node-on-edit');
        currentElement.closest('.file-node-content').attr('draggable', 'true');
      }
      function applyEntryRename(entry, newPath, name) {
        var path = entry.path;
        receiver.onRemoveFile(entry);
        Object.defineProperty(
          function rewriteDescendantPaths(childEntry, newPrefix) {
            childEntry.path = childEntry.path.replace(path, newPrefix);
            (childEntry.content || []).forEach((item) => {
              item.path = item.path.replace(path, newPrefix);
            });
            (childEntry.subdir || []).forEach((item) => {
              rewriteDescendantPaths(item, newPrefix);
            });
          },
          'name',
          { value: 'e', configurable: true },
        )(entry, newPath);
        entry.name = name;
        receiver.onAddFile(entry);
      }
    }
    isShown() {
      return 'file-tree' == this.parent.getActiveTab();
    }
    bindEvents() {
      var receiver = this;
      jquery('#file-library-tree').on('click', '.file-node-content', function (keyboardEvent) {
        if (1 === keyboardEvent.which) {
          keyboardEvent.preventDefault();
          keyboardEvent.stopPropagation();
          document.activeElement.blur();
          var element = jquery(this).parent(),
            filePath = element.attr('data-path'),
            isDirectoryAttribute = element.attr('data-is-directory');
          if (element.hasClass('file-node-on-edit')) {
            return false;
          }
          if (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey) {
            receiver.parent.openWithCtrl(filePath, 'true' == isDirectoryAttribute);
          } else {
            if ('false' == isDirectoryAttribute) {
              receiver.parent.openFile(filePath);
            } else {
              if ('true' == element.attr('data-has-sub')) {
                if (element.hasClass('file-node-expanded')) {
                  (function (inputElement, filePath) {
                    (receiver.findNodeFromPath(filePath) || {}).isOpen = false;
                    inputElement.addClass('file-node-collapsed').removeClass('file-node-expanded');
                  })(element, filePath);
                } else {
                  receiver.expandNode(element, filePath);
                }
              }
            }
          }
        }
      });
    }
  };
}
