// ui/file-tree.
// SystemJS module 50. Dependencies: 11, 13, 33, 35, 29, e, 4f.
$__System.registerDynamic(
  '50',
  ['11', '13', '33', '35', '29', 'e', '4f'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var utilities = requireModule('11'),
      documentModel = requireModule('13'),
      fileIntegration = (documentModel.Node, documentModel.TYPE, requireModule('33')),
      recovery = requireModule('35'),
      dialogs = ((utilities = requireModule('11')), requireModule('29')),
      jquery = requireModule('e'),
      domMorph = requireModule('4f'),
      renderState = !1,
      currentPath = '_recent';
    function h(callbackElement, nextElement) {
      if (callbackElement.length && nextElement.length) {
        if (!callbackElement[0].parentElement) return;
        let childrenStateChanged =
          callbackElement.attr('data-has-sub') != nextElement.attr('data-has-sub');
        childrenStateChanged &&
          callbackElement.attr('data-has-sub', nextElement.attr('data-has-sub')),
          domMorph(callbackElement[0], nextElement[0], {
            childrenOnly: !childrenStateChanged,
            getNodeKey: function (domNode) {
              return domNode.dataset && domNode.dataset.path;
            },
            onBeforeElUpdated: function (element, inputElement) {
              element.classList.contains('file-node-collapsed') &&
                !childrenStateChanged &&
                (inputElement.classList.add('file-node-collapsed'),
                inputElement.classList.remove('file-node-expanded'));
            },
          });
      }
    }
    var statWrapper = fileIntegration.statWrapper;
    function f(entry, traversalContext) {
      return File.isMac
        ? new Promise(function (resolvePromise) {
            m(entry, resolvePromise);
          })
        : g(entry, !1, traversalContext);
    }
    function m(entry, onLoaded) {
      if (!entry.path) return onLoaded(null);
      bridge.callHandler('library.listDocsUnder', entry.path, function (directoryData) {
        if (!directoryData || !directoryData.name) return onLoaded(null);
        var mappedItems;
        (entry.fetched = !0),
          (entry.subdir = directoryData.subdir),
          (entry.lastModified = directoryData.lastModified),
          (entry.createDate = directoryData.createDate),
          (entry.alias = directoryData.alias),
          ((mappedItems = entry.subdir.map(function (item, itemIndex) {
            return new Promise(function (resolvePromise) {
              item.isOpen
                ? ((item.fetched = !0), resolvePromise())
                : document.querySelector(
                      ".file-node-expanded.file-tree-node[data-path='" +
                        utilities.escapeSelector(item.path) +
                        "']",
                    )
                  ? m(item, function (childEntry) {
                      (entry.subdir[itemIndex] = childEntry),
                        entry.subdir[itemIndex] && (entry.subdir[itemIndex].isOpen = !0),
                        resolvePromise();
                    })
                  : resolvePromise();
            });
          })),
          mappedItems && mappedItems.length ? Promise.all(mappedItems) : Promise.resolve()).then(
            function () {
              (entry.content = directoryData.content),
                (entry.isDirectory = directoryData.isDirectory),
                (entry.isFile = directoryData.isFile),
                (entry.name = directoryData.name),
                onLoaded && onLoaded(entry);
            },
          );
      });
    }
    function g(entry, shallow, traversalContext) {
      var fileSystemPlus = reqnode('fs-plus'),
        pathUtilities = reqnode('path'),
        pathSeparator = File.isWin ? '\\' : '/';
      return new Promise(function (resolvePromise, rejectPromise) {
        var path = entry.path;
        if (
          ((entry.name = pathUtilities.basename(path) || path),
          (entry.subdir = []),
          (entry.content = []),
          (entry.fetched = !shallow),
          '.' == entry.name[0] && !entry.isOpen)
        )
          return resolvePromise();
        statWrapper(path, function (fileInfo) {
          if (!fileInfo || fileInfo.shouldIgnore) return resolvePromise();
          if (
            ((entry.isDirectory = fileInfo.isDir),
            (entry.isFile = fileInfo.isFile),
            File.option.supportTextBundle &&
              entry.isDirectory &&
              /\.textbundle$/.exec(entry.name) &&
              ((entry.type = File.FileType.TextBundle),
              (entry.isDirectory = !1),
              (entry.isFile = !0)),
            File.option.supportTextPack &&
              !entry.isDirectory &&
              /\.textpack$/.exec(entry.name) &&
              ((entry.type = File.FileType.TextPack),
              (entry.isDirectory = !1),
              (entry.isFile = !0)),
            (entry.lastModified = fileInfo.mtime),
            (entry.createDate = fileInfo.birthtime),
            fileInfo.isFile)
          )
            return (
              (entry.fetched = !0),
              fileIntegration.isSupportedFile(entry.name) ? resolvePromise(entry) : resolvePromise()
            );
          if (fileInfo.isDir) {
            if (
              (function (filePath) {
                return (
                  File.bundle.filePath &&
                  filePath &&
                  0 == File.bundle.filePath.indexOf(filePath.replace(/[\/\\]$/, '') + pathSeparator)
                );
              })(path)
            )
              entry.isOpen = !0;
            else if (shallow) return resolvePromise(entry);
            fileSystemPlus.list(path, void 0, function (readError, items) {
              if (readError) return resolvePromise();
              entry.isOpen ||
                (document.querySelector(
                  ".file-node-expanded.file-tree-node[data-path='" +
                    utilities.escapeSelector(path) +
                    "']",
                ) &&
                  (entry.isOpen = !0)),
                Promise.all(
                  items.map(function (inputPath) {
                    return g({ path: inputPath }, !entry.isOpen, traversalContext);
                  }),
                ).then(function (inputItems) {
                  (entry.fetched = !0),
                    'oversize' != renderState && File.editor.library.addWatchByUnix(entry.path),
                    entry.subdir.length + entry.content.length > 0
                      ? resolvePromise(entry)
                      : (inputItems.forEach(function (item) {
                          item &&
                            (item.isDirectory ? entry.subdir.push(item) : entry.content.push(item));
                        }),
                        resolvePromise(entry));
                });
            });
          }
        });
      });
    }
    moduleRecord.exports = class {
      constructor(parent) {
        (this.parent = parent),
          (this.editor = parent.editor),
          (this.$template = jquery(
            document.querySelector('#file-library-node-template').textContent,
          )),
          this.root,
          (this.noGroup = File.option.treeNoGroup || !1),
          (this.sortType = File.option.treeSortType);
      }
      getRoot() {
        return this.parent.root;
      }
      setRoot(root) {
        return (this.parent.root = root);
      }
      renderNode(entry, noGroup) {
        if (!entry) return jquery();
        var element = this.$template.clone(),
          parent = this.parent;
        this.noGroup ||
          noGroup ||
          (entry.subdir && entry.subdir.sort(parent.compareItem.bind(parent)),
          entry.content && entry.content.sort(parent.compareItem.bind(parent))),
          entry == this.getRoot()
            ? ((entry.isOpen = !0), element.find('.file-node-open-state').remove())
            : entry.isDirectory &&
              entry.subdir &&
              (entry.subdir.length || entry.content.length) &&
              element
                .attr('data-has-sub', 'true')
                .addClass(entry.isOpen ? 'file-node-expanded' : 'file-node-collapsed');
        var substringLength = entry.name.lastIndexOf('.');
        if (
          ((substringLength < 0 || entry.isDirectory) && (substringLength = entry.name.length),
          element.find('.file-node-title-name-part').text(entry.name.substr(0, substringLength)),
          element.find('.file-node-title-ext-part').text(entry.name.substr(substringLength)),
          element.attr('data-path', entry.path).attr('data-is-directory', entry.isDirectory),
          element.find('.file-node-icon').addClass(
            function (entry) {
              return entry == this.getRoot()
                ? entry.path == currentPath
                  ? 'fa fa-history'
                  : 'fa fa-folder'
                : entry.isDirectory
                  ? 'fa fa-folder'
                  : entry.type == File.FileType.TextBundle
                    ? 'marklyra-icon marklyra-textbundle'
                    : entry.type == File.FileType.TextPack
                      ? 'marklyra-icon marklyra-textbundle'
                      : 'fa fa-file-text-o';
            }.call(this, entry),
          ),
          element
            .find('.file-node-title')
            .attr('title', utilities.abbreviatingWithTilde(entry.path)),
          entry.isDirectory || element.addClass('file-library-file-node'),
          entry == this.getRoot()
            ? element.addClass('file-node-root')
            : entry.isDirectory ||
              entry.path != fileIntegration.getCurrentFilePath() ||
              element.addClass('active'),
          entry.isDirectory)
        ) {
          var elements = element.find('.file-node-children');
          if ((elements.html(''), entry.isOpen && entry.fetched))
            if (this.noGroup) {
              let items = (entry.subdir || []).concat(entry.content || []);
              items.sort(parent.compareItem.bind(parent)),
                items.forEach(function (item) {
                  elements.append(this.renderNode(item));
                }, this);
            } else
              entry.subdir.forEach(function (item) {
                elements.append(this.renderNode(item));
              }, this),
                entry.content.forEach(function (item) {
                  elements.append(this.renderNode(item));
                }, this);
        }
        return element;
      }
      renderIfNeed() {
        return (
          !renderState &&
          (this.render(), File.isNode && this.parent.addWatch(File.getMountFolder()), !0)
        );
      }
      render(forceRefresh) {
        renderState = !0;
        var receiver = this,
          mountFolder = File.getMountFolder();
        (receiver.getRoot()
          ? Promise.resolve(receiver.getRoot())
          : new Promise(function (resolvePromise) {
              receiver.parent.calcMountFolder().then(function (path) {
                (receiver.parent.root = { path: path, isOpen: !0 }),
                  path
                    ? f(receiver.parent.root, receiver).then(function (root) {
                        (receiver.parent.root = root),
                          resolvePromise(root),
                          (receiver.parent.silent = !1);
                      })
                    : resolvePromise(null);
              });
            })
        ).then(function (result) {
          result && result.path
            ? (forceRefresh || 1 == renderState) &&
              function () {
                (renderState = 'complete'),
                  jquery('#file-library-tree')
                    .html('')
                    .append(this.renderNode(this.getRoot()))
                    .attr('data-state', ''),
                  this.parent.markCurrentFile();
              }.call(receiver)
            : (jquery('#file-library-tree').html(''),
              receiver.parent.onLoadFolderFailed(!mountFolder));
        }),
          jquery('#file-library-tree').attr('data-state', 'rendering').html('');
      }
      findElemFromPath(path) {
        return (
          (path = (this.findNodeFromPath(path) || {}).path),
          jquery(".file-tree-node[data-path='" + utilities.escapeSelector(path) + "']")
        );
      }
      focusToFile(text, unusedParameter2, skipMarkActive, onFocused) {
        if (this.getRoot() && text && !0 !== renderState) {
          var searchValue = File.getMountFolder(),
            pathSeparator = File.isWin ? '\\' : '/',
            receiver = this,
            innerHeight = window.innerHeight,
            scrollContainer = File.isMac ? jquery('.sidebar-content') : jquery('#file-library'),
            scrollOffset = scrollContainer.scrollTop();
          0 === text.indexOf(searchValue) &&
            (function t(currentPath, pathSegments) {
              if (0 != pathSegments.length)
                if (1 == pathSegments.length) {
                  var fileElement = skipMarkActive
                    ? receiver.findElemFromPath(text)
                    : receiver.markOpenedFile(text);
                  !(function (itemElement) {
                    if (itemElement.length) {
                      var offsetTop = itemElement[0].offsetTop;
                      offsetTop < scrollOffset
                        ? ((scrollOffset = offsetTop), scrollContainer.scrollTop(scrollOffset))
                        : offsetTop - scrollOffset > innerHeight - 200 &&
                          ((scrollOffset = offsetTop - innerHeight + 300),
                          scrollContainer.scrollTop(scrollOffset));
                    }
                  })(fileElement),
                    0 == scrollContainer.scrollTop() &&
                      setTimeout(function () {
                        0 != scrollContainer.scrollTop() ||
                          scrollOffset ||
                          scrollContainer.scrollTop(scrollOffset);
                      }, 200),
                    onFocused && onFocused(fileElement);
                } else
                  (currentPath = (currentPath + pathSeparator + pathSegments.shift()).replace(
                    /[\\]+/,
                    '\\',
                  )),
                    receiver.expandNode(
                      receiver.findElemFromPath(currentPath),
                      currentPath,
                      function () {
                        t(currentPath, pathSegments);
                      },
                    );
            })(
              searchValue,
              text
                .substr(searchValue.length)
                .replace(/^[\\/]+/g, '')
                .split(/[\\/]+/) || [],
            );
        }
      }
      highlight(filePath) {
        var receiver = this;
        this.focusToFile(filePath, !1, !0, function (element) {
          element.addClass('blink-area'),
            setTimeout(function () {
              element.removeClass('blink-area');
            }, 2e3),
            element.length && (receiver.parent.nextChangeHighlight = null);
        });
      }
      markOpenedFile(filePath) {
        return this.parent.markOpenedFile(filePath).filter('.file-tree-node');
      }
      needRepaint() {
        renderState = !1;
      }
      findNodeFromPath(filePath, items) {
        if (filePath && this.getRoot())
          return (
            (items = items || []),
            (function e(entry, targetPath) {
              if (entry) {
                if (utilities.isSamePath(entry.path, targetPath)) return entry;
                items.push(entry);
                for (var itemIndex = 0; itemIndex < (entry.subdir || []).length; itemIndex++) {
                  var childEntry = entry.subdir[itemIndex];
                  if (childEntry) {
                    if (utilities.isSamePath(childEntry.path, targetPath))
                      return (childEntry.folderPath = entry.path), childEntry;
                    if (utilities.isAncestorPathOf(childEntry.path, targetPath))
                      return e(childEntry, targetPath);
                  }
                }
                var elements = entry.content.find(function (item) {
                  return utilities.isSamePath(item.path, targetPath);
                });
                return elements && (elements.folderPath = entry.path), elements;
              }
              return null;
            })(this.getRoot(), filePath)
          );
      }
      expand(filePath, elementOverride, onExpanded) {
        var element;
        return (1 !=
          (element = elementOverride ? jquery(elementOverride) : this.findElemFromPath(filePath))[0]
            .dataset.hasSub &&
          'true' != element[0].dataset.hasSub) ||
          !element.hasClass('file-node-collapsed')
          ? (onExpanded && onExpanded(), !1)
          : (this.expandNode(element, filePath, onExpanded), !0);
      }
      expandNode(element, filePath, onExpanded) {
        if (!0 !== renderState) {
          var entry = this.findNodeFromPath(filePath, []),
            receiver = this;
          entry &&
            ((entry.isOpen = !0),
            element.children('.file-node-children').children().length
              ? element.removeClass('file-node-collapsed').addClass('file-node-expanded')
              : (!entry.fetched || (entry.subdir.length > 0 && !entry.subdir[0].fetched)) &&
                  element.length &&
                  element[0].parentElement
                ? f(entry, receiver).then(function (result) {
                    result &&
                      element.length &&
                      element[0].parentElement &&
                      (element.replaceWith(receiver.renderNode(result)),
                      jquery('.file-library-node.active').length ||
                        receiver.markOpenedFile(fileIntegration.getCurrentFilePath()),
                      onExpanded && onExpanded());
                  })
                : element.replaceWith(this.renderNode(entry)),
            jquery('.file-library-node.active').length ||
              this.markOpenedFile(fileIntegration.getCurrentFilePath()),
            onExpanded && onExpanded());
        }
      }
      setSortType(sortType) {
        (this.sortType = sortType),
          JSBridge.putSetting('treeSortType', sortType),
          'complete' === renderState && this.getRoot() && this.getRoot().fetched && this.render(!0);
      }
      setGroupByFolder(noGroup) {
        noGroup
          ? jquery('#marklyra-group-by-folder-btn').removeClass('active')
          : jquery('#marklyra-group-by-folder-btn').addClass('active'),
          'complete' === renderState &&
            this.noGroup != noGroup &&
            ((this.noGroup = noGroup),
            this.render(!0),
            JSBridge.putSetting('treeNoGroup', noGroup));
      }
      onChangeForMac(items) {
        if (renderState) {
          var changedEntry,
            ancestors = [],
            set = new Set(),
            currentSet = new Set(),
            receiver = this,
            sortByDate = this.parent.dateAffectsSort(),
            renamingPath = jquery('.file-node-on-edit').attr('data-path');
          items.forEach(function (item) {
            if (
              ((changedEntry = this.findNodeFromPath(item.path, ancestors)),
              (item.oldPath || item.path) != renamingPath && this.getRoot())
            )
              if ('removed' == item.type)
                item.path == this.getRoot().path
                  ? (this.parent.root = null)
                  : changedEntry &&
                    ancestors.length &&
                    f.call(this, changedEntry, ancestors.last());
              else if ('rename' == item.type) {
                if (item.oldPath == this.getRoot().path) return void (this.parent.root = null);
                (ancestors = []),
                  (changedEntry = this.findNodeFromPath(item.oldPath, ancestors)),
                  f.call(this, changedEntry, ancestors.last()),
                  g(item.newPath, item.isDir);
              } else
                'created' == item.type &&
                  changedEntry != this.getRoot() &&
                  (changedEntry
                    ? sortByDate
                      ? ((changedEntry.lastModified = new Date()),
                        this.onRemoveFile(changedEntry),
                        this.onAddFile(changedEntry))
                      : set.add(ancestors.last())
                    : (item.isDir || (item.path && !/~\.[^.]+$/.exec(item.path))) &&
                      g(item.path, item.isDir));
          }, this),
            this.getRoot()
              ? ((receiver = this),
                currentSet.forEach(function (item) {
                  m(item, function (updatedEntry) {
                    updatedEntry && u.call(receiver, updatedEntry);
                  }),
                    set.delete(item);
                }, this),
                set.forEach(function (item) {
                  u.call(this, item);
                }, this))
              : this.parent.onRootChanged();
        }
        function u(entry) {
          var element = receiver.findElemFromPath(entry.path),
            previousScrollTop = null;
          element.hasClass('file-node-root') &&
            (previousScrollTop = jquery('.sidebar-content').scrollTop()),
            h(element, receiver.renderNode(entry)),
            previousScrollTop && jquery('.sidebar-content').scrollTop(previousScrollTop),
            p(entry.path);
        }
        function p(searchValue) {
          var nextChangeHighlight = receiver.parent.nextChangeHighlight;
          nextChangeHighlight &&
            0 == nextChangeHighlight.indexOf(searchValue) &&
            receiver.highlight(nextChangeHighlight);
        }
        function f(entry, parentEntry) {
          entry &&
            (receiver.findElemFromPath(entry.path).remove(),
            receiver.parent.unwatchByUnix(entry.path),
            entry.isDirectory
              ? parentEntry.subdir.remove(entry)
              : parentEntry.content.remove(entry),
            parentEntry.subdir.length + parentEntry.content.length == 0 &&
              ((entry.isOpen = !1), u.call(this, parentEntry)));
        }
        function g(filePath, isDirectory) {
          var parentPath = utilities.pathByDeleteLastComponent(filePath),
            parentEntry = receiver.findNodeFromPath(parentPath);
          receiver.findNodeFromPath(filePath) ||
            (parentEntry &&
              function (path, parentEntry, isDirectory) {
                if (parentEntry.fetched && !currentSet.has(parentEntry)) {
                  var newEntry;
                  if (
                    (File.option.supportTextBundle &&
                      /\.textbundle$/.exec(path) &&
                      (isDirectory = !1),
                    parentEntry.content.length + parentEntry.subdir.length == 0 &&
                      currentSet.add(parentEntry),
                    isDirectory)
                  ) {
                    if (
                      parentEntry.subdir.findIndex(function (item) {
                        return item.path == path;
                      }) > -1
                    )
                      return;
                    currentSet.add(parentEntry);
                  } else {
                    if (
                      parentEntry.content.findIndex(function (item) {
                        return item.path == path;
                      }) > -1
                    )
                      return;
                    (newEntry = {
                      path: path,
                      isDirectory: !1,
                      name: path.split('/').last(),
                      lastModified: new Date(),
                      createDate: new Date(),
                    }),
                      parentEntry.content.push(newEntry);
                  }
                  set.add(parentEntry);
                }
              }.call(receiver, filePath, parentEntry, isDirectory),
            p(filePath));
        }
      }
      isPathTooDeepToDisplay(text, ancestors) {
        return (
          (ancestors = ancestors || []),
          this.findNodeFromPath(text, ancestors),
          !ancestors.length ||
            !!text
              .substr(ancestors.last().path.length)
              .replace(/^[\\/]+/, '')
              .match(/[\\/]/)
        );
      }
      onChangeForWin(searchValue, items, eventType) {
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
            this.isPathTooDeepToDisplay(searchValue, ancestors) ||
              (function (inputPath, ancestors, onUpdated) {
                if (
                  ((ancestors = ancestors || []),
                  !items.find(function (item) {
                    return item == inputPath || 0 == inputPath.indexOf(item + pathSeparator);
                  }))
                ) {
                  items.push(inputPath);
                  var directoryPath = reqnode('path').dirname(inputPath),
                    parentEntry = receiver.findNodeFromPath(directoryPath);
                  if (parentEntry && parentEntry.fetched) {
                    var shallow = !parentEntry.isOpen;
                    'unlink' != eventType
                      ? g({ path: inputPath }, shallow, receiver).then(function (result) {
                          result
                            ? ((function (path, updatedEntry, parentEntry) {
                                var existingEntry = receiver.findNodeFromPath(path);
                                existingEntry && existingEntry.fetched
                                  ? existingEntry.path != path &&
                                    (receiver
                                      .findElemFromPath(existingEntry.path)
                                      .replaceWith(receiver.renderNode(updatedEntry)),
                                    (existingEntry.path = updatedEntry.path),
                                    (existingEntry.name = updatedEntry.name))
                                  : receiver.onAddFile(updatedEntry, parentEntry);
                              })(inputPath, result, parentEntry),
                              onUpdated && onUpdated())
                            : s(inputPath, ancestors);
                        })
                      : s(inputPath, ancestors);
                  }
                }
              })(searchValue, ancestors, function () {
                if (receiver.parent.useTreeStyle) {
                  var nextChangeHighlight = receiver.parent.nextChangeHighlight;
                  nextChangeHighlight &&
                    0 == nextChangeHighlight.indexOf(searchValue) &&
                    receiver.highlight(nextChangeHighlight);
                }
              });
          }
        }
        function s(filePath, ancestors) {
          receiver.onRemoveFile(filePath, (ancestors || []).last());
        }
      }
      onFileUpdated(filePath) {
        var entry = this.findNodeFromPath(filePath);
        entry &&
          ((entry.lastModified = new Date()),
          this.parent.dateAffectsSort() && (this.onRemoveFile(entry), this.onAddFile(entry)));
      }
      onRemoveFile(entryOrPath, parentOverride) {
        var entry, path;
        if (
          ('string' == typeof entryOrPath
            ? ((path = entryOrPath), (entry = this.findNodeFromPath(path)))
            : entryOrPath && entryOrPath.path && (path = (entry = entryOrPath).path),
          entry)
        ) {
          var parentEntry = parentOverride || this.findNodeFromPath(entry.folderPath);
          if ((this.findElemFromPath(path).remove(), !parentEntry)) return;
          parentEntry.subdir.removeIf(function (childEntry) {
            return utilities.isSamePath(childEntry.path, entry.path);
          }),
            parentEntry.content.removeIf(function (childEntry) {
              return utilities.isSamePath(childEntry.path, entry.path);
            }),
            parentEntry.subdir.length + parentEntry.content.length == 0 &&
              this.findElemFromPath(parentEntry.path).replaceWith(this.renderNode(parentEntry));
        }
      }
      onAddFile(searchValue, parentOverride) {
        var parentEntry = parentOverride || this.findNodeFromPath(searchValue.folderPath),
          wasEmpty = parentEntry.content.length + parentEntry.subdir.length == 0,
          items = searchValue.isDirectory ? parentEntry.subdir : parentEntry.content;
        items.splice(0, 0, searchValue), items.sort(this.parent.compareItem.bind(this.parent));
        var insertionIndex = items.indexOf(searchValue);
        if ((searchValue.isDirectory || (insertionIndex += parentEntry.subdir.length), wasEmpty))
          this.findElemFromPath(parentEntry.path).replaceWith(this.renderNode(parentEntry));
        else {
          var childrenElement = this.findElemFromPath(parentEntry.path).children(
            '.file-node-children',
          );
          if (parentEntry.isOpen || childrenElement.children().length) {
            var itemElement = this.renderNode(searchValue)[0];
            return (
              childrenElement[0] &&
                childrenElement[0].insertChildAtIndex(itemElement, insertionIndex),
              itemElement
            );
          }
        }
      }
      newFile(folderPath) {
        this.newFileCommand(this.findElemFromPath(folderPath), !1);
      }
      newFolderCommand(targetElement) {
        this.newFileCommand(targetElement, !0);
      }
      newFileCommand(targetElement, createDirectory) {
        var element = this.editor.getJQueryElem(targetElement).closest('.file-library-node'),
          folderPath = element.attr('data-path'),
          targetIsDirectory = 'true' == element.attr('data-is-directory'),
          receiver = this;
        async function c(parentEntry, parentElement, newEntry, isFile) {
          if (
            (parentElement.parent().length ||
              (parentElement = receiver.findElemFromPath(parentEntry.path)),
            isFile)
          ) {
            if ((parentEntry.content.push(newEntry), receiver.parent.isDiscardableUntitled()))
              return (
                await new Promise((resolvePromise) => {
                  receiver.parent.openFile(newEntry.path, resolvePromise);
                }),
                h(parentElement, receiver.renderNode(parentEntry, !0)),
                receiver.focusToFile(newEntry.path),
                void setTimeout(function () {
                  receiver.parent.markCurrentFile(),
                    receiver.parent.resumeOnChange(),
                    receiver.renameFileCommand(receiver.findElemFromPath(newEntry.path)[0], !0);
                }, 10)
              );
          } else parentEntry.subdir.push(newEntry);
          h(parentElement, receiver.renderNode(parentEntry, !0)),
            receiver.renameFileCommand(receiver.findElemFromPath(newEntry.path)[0], !0);
        }
        function d() {
          var parentEntry = this.findNodeFromPath(folderPath);
          if (parentEntry) {
            var name = (function (parentEntry, createDirectory) {
                var untitledIndex = 0;
                return createDirectory
                  ? (parentEntry.subdir.forEach(function (item) {
                      if (item) {
                        var match = /^untitled folder( (\d+))?$/i.exec(item.name);
                        match && (untitledIndex = Math.max(untitledIndex, (match[2] || 0) - 0 + 1));
                      }
                    }),
                    'Untitled Folder' + (untitledIndex ? ' ' + untitledIndex : ''))
                  : (parentEntry.content.forEach(function (item) {
                      var match = /^untitled( (\d+))?\./i.exec(item.name);
                      match && (untitledIndex = Math.max(untitledIndex, (match[2] || 0) - 0 + 1));
                    }),
                    'Untitled' +
                      (untitledIndex ? ' ' + untitledIndex : '') +
                      '.' +
                      File.FileOption.getDefaultExtension());
              })(parentEntry, createDirectory),
              fileSystem = File.isNode && reqnode('fs');
            try {
              var parentElement = this.findElemFromPath(folderPath),
                path = folderPath + (File.isWin ? '\\' : '/') + name,
                newEntry = {
                  fetched: !0,
                  subdir: [],
                  content: [],
                  isDirectory: !!createDirectory,
                  folderPath: folderPath,
                  isFile: !createDirectory,
                  name: name,
                  path: path,
                };
              receiver.parent.pauseOnChange(!0),
                createDirectory
                  ? File.isNode
                    ? fileSystem.mkdir(path, function (createError) {
                        createError
                          ? receiver.parent.resumeOnChange()
                          : c(parentEntry, parentElement, newEntry, !1);
                      })
                    : bridge.callHandler('library.newFolder', path, function (created) {
                        created
                          ? c(parentEntry, parentElement, newEntry, !1)
                          : receiver.parent.resumeOnChange();
                      })
                  : File.isNode
                    ? fileSystem.writeFile(path, '', function (inputError) {
                        inputError
                          ? (dialogs.showErrorDialog(
                              jquery.localize.getString('Operation Failed'),
                              inputError,
                            ),
                            console.error(inputError),
                            receiver.parent.resumeOnChange())
                          : c(parentEntry, parentElement, newEntry, !0);
                      })
                    : bridge.callHandler('library.newFile', path, function (created) {
                        created
                          ? c(parentEntry, parentElement, newEntry, !0)
                          : receiver.parent.resumeOnChange();
                      });
            } catch (error) {
              receiver.parent.resumeOnChange();
            }
          }
        }
        folderPath ||
          ((element = jquery('#file-library-tree .file-node-root')),
          (folderPath = element.attr('data-path')),
          (targetIsDirectory = !0)),
          folderPath &&
            (targetIsDirectory || (folderPath = utilities.pathByDeleteLastComponent(folderPath)),
            targetIsDirectory
              ? ((receiver = this),
                this.expandNode(element, folderPath, function () {
                  d.call(receiver);
                }))
              : d.call(this));
      }
      renameFileCommand(targetElement, newlyCreated, renameCompatibilityFlag) {
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
          (inputWidth = Math.min(inputWidth, 200)),
            (inputWidth = Math.max(inputWidth, 140)),
            localElement.width(inputWidth),
            currentElement.closest('.file-node-content').attr('draggable', 'false');
          var isDirectory = 'true' === element.attr('data-is-directory');
          this.parent.bindRename(
            localElement,
            function (inputElement) {
              File.isMac
                ? (function (inputElement) {
                    var currentTrimmedText = inputElement
                        .val()
                        .replace(/[\/\\]/g, '')
                        .trim(),
                      newValue =
                        utilities.pathByDeleteLastComponent(old) + '/' + currentTrimmedText;
                    receiver.parent.pauseOnChange(!0);
                    var wasCurrentFile = old == fileIntegration.getCurrentFilePath();
                    old != newValue
                      ? bridge.callHandler(
                          'library.renameFile',
                          { old: old, new: newValue },
                          function (renamed) {
                            if (renamed) {
                              var entry = receiver.findNodeFromPath(old);
                              if (!entry) return;
                              v(entry, newValue, currentTrimmedText),
                                wasCurrentFile &&
                                  (console.debug('update marked file'),
                                  setTimeout(function () {
                                    receiver.parent.markOpenedFile(newValue, !0),
                                      receiver.focusToFile(newValue);
                                  }, 200)),
                                receiver.parent.scheduleChangeHighlight(newValue);
                            } else inputElement.val(trimmedText);
                          },
                        )
                      : inputElement.val(trimmedText),
                      element.removeClass('file-node-on-edit'),
                      receiver.editor.restoreLastCursor();
                  })(inputElement)
                : (function (inputElement) {
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
                      (newPath = newPath.trim()),
                        inputElement.closest('.file-node-on-edit').removeClass('file-node-on-edit');
                      var containsCurrentFile =
                          File.bundle.filePath &&
                          utilities.isAncestorPathOf(old, File.bundle.filePath),
                        fileSystemExtra = reqnode('fs-extra');
                      utilities.isSamePath(old, newPath) || !fileSystemExtra.existsSync(newPath)
                        ? (JSBridge.invoke('app.sendEvent', 'willRename', { oldPath: old }),
                          receiver.parent.execRenameFileByNode(old, newPath).then(function ([
                            renameError,
                          ]) {
                            element.removeClass('file-node-on-edit'),
                              receiver.editor.restoreLastCursor(),
                              renameError && (newPath = old),
                              JSBridge.invoke('app.sendEvent', 'didRename', {
                                oldPath: old,
                                newPath: newPath,
                              });
                            var pathUtilities = reqnode('path');
                            receiver.parent.resumeOnChange();
                            var fileName = pathUtilities.basename(newPath),
                              entry = receiver.findNodeFromPath(old);
                            if (entry)
                              if ((v(entry, newPath, fileName), renameError)) f(renameError);
                              else if (
                                (console.debug('renamed'),
                                newlyCreated ||
                                  (JSBridge.invoke(
                                    'filesOp.registerUndo',
                                    newPath,
                                    old,
                                    jquery.localize
                                      .getString('Rename %@', 'Panel')
                                      .replace('%@', pathUtilities.basename(old)),
                                  ),
                                  receiver.parent.scheduleChangeHighlight(newPath)),
                                !File.bundle.filePath)
                              )
                                return;
                          }))
                        : f(
                            jquery.localize.getString(
                              'File with same name already exists at target path.',
                            ),
                          );
                    } else g();
                    function f(errorMessage) {
                      dialogs.showErrorDialog(
                        jquery.localize.getString('Rename Failed'),
                        jquery.localize
                          .getString('Failed to rename from "{0}" to "{1}"')
                          .format(trimmedText, currentTrimmedText) +
                          '\n' +
                          errorMessage,
                      ),
                        console.debug(errorMessage),
                        containsCurrentFile && recovery.watchFileChange(File.bundle.filePath),
                        JSBridge.invoke('filesOp.clearUndo');
                    }
                  })(inputElement);
            },
            g,
            isDirectory,
            !1,
            renameCompatibilityFlag,
            utilities.pathByDeleteLastComponent(old),
          ),
            localElement.focus();
        }
        function g() {
          localElement.closest('.file-node-on-edit').removeClass('file-node-on-edit'),
            currentElement.closest('.file-node-content').attr('draggable', 'true');
        }
        function v(entry, newPath, name) {
          var path = entry.path;
          receiver.onRemoveFile(entry),
            (function e(childEntry, newPrefix) {
              (childEntry.path = childEntry.path.replace(path, newPrefix)),
                (childEntry.content || []).forEach((item) => {
                  item.path = item.path.replace(path, newPrefix);
                }),
                (childEntry.subdir || []).forEach((item) => {
                  e(item, newPrefix);
                });
            })(entry, newPath),
            (entry.name = name),
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
            keyboardEvent.preventDefault(),
              keyboardEvent.stopPropagation(),
              document.activeElement.blur();
            var element = jquery(this).parent(),
              filePath = element.attr('data-path'),
              isDirectoryAttribute = element.attr('data-is-directory');
            if (element.hasClass('file-node-on-edit')) return !1;
            (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey)
              ? receiver.parent.openWithCtrl(filePath, 'true' == isDirectoryAttribute)
              : 'false' == isDirectoryAttribute
                ? receiver.parent.openFile(filePath)
                : 'true' == element.attr('data-has-sub') &&
                  (element.hasClass('file-node-expanded')
                    ? (function (inputElement, filePath) {
                        ((receiver.findNodeFromPath(filePath) || {}).isOpen = !1),
                          inputElement
                            .addClass('file-node-collapsed')
                            .removeClass('file-node-expanded');
                      })(element, filePath)
                    : receiver.expandNode(element, filePath));
          }
        });
      }
    };
  },
);
