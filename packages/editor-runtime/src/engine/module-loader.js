// Lazy module initialization keeps cyclic partial exports and the host receiver.
export function createEngineLoader(hostGlobal) {
  function defineNamespaceProperty(name) {
    Object.defineProperty(this, name, {
      enumerable: true,
      get: function () {
        return this[namespaceStorage][name];
      },
    });
  }

  function namespaceFromExternal(exportsValue) {
    if (
      typeof System !== 'undefined' && System.isModule
        ? System.isModule(exportsValue)
        : Object.prototype.toString.call(exportsValue) === '[object Module]'
    ) {
      return exportsValue;
    }
    var values = { default: exportsValue, __useDefault: exportsValue };
    if (exportsValue && exportsValue.__esModule) {
      for (var name in exportsValue) {
        if (Object.hasOwnProperty.call(exportsValue, name)) {
          values[name] = exportsValue[name];
        }
      }
    }
    return new ModuleNamespace(values);
  }

  function ModuleNamespace(values) {
    Object.defineProperty(this, namespaceStorage, { value: values });
    Object.keys(values).forEach(defineNamespaceProperty, this);
  }

  function findModule(name) {
    if (name.substr(0, 6) === '@node/') {
      return setModule(name, namespaceFromExternal(nativeRequire(name.substr(6))));
    } else {
      return records[name];
    }
  }

  function linkDependencies(record, link) {
    if (!link.depLoads) {
      if (link.declare) {
        initializeDeclaration(record, link);
      }
      link.depLoads = [];
      for (var index = 0; index < link.deps.length; index++) {
        var dependency = findModule(link.deps[index]);
        link.depLoads.push(dependency);
        if (dependency.linkRecord) {
          linkDependencies(dependency, dependency.linkRecord);
        }
        var setter = link.setters && link.setters[index];
        if (setter) {
          setter(dependency.module || dependency.linkRecord.moduleObj);
          dependency.importerSetters.push(setter);
        }
      }
      return record;
    }
  }

  function loadModule(name) {
    var record = findModule(name);
    if (!record) {
      throw new Error('Module "' + name + '" expected, but not contained in build.');
    }
    if (record.module) {
      return record.module;
    }
    var link = record.linkRecord;
    linkDependencies(record, link);
    executeModule(record, link, []);
    return record.module;
  }

  function initializeDeclaration(record, link) {
    var values = link.moduleObj;
    var importers = record.importerSetters;
    var notifying = false;
    var declaration = link.declare.call(
      hostGlobal,
      function (name, value) {
        if (!notifying) {
          if (typeof name === 'object') {
            for (var property in name) {
              if (property !== '__useDefault') {
                values[property] = name[property];
              }
            }
          } else {
            values[name] = value;
          }
          notifying = true;
          for (var index = 0; index < importers.length; index++) {
            importers[index](values);
          }
          notifying = false;
          return value;
        }
      },
      { id: record.key },
    );
    if (typeof declaration !== 'function') {
      link.setters = declaration.setters;
      link.execute = declaration.execute;
    } else {
      link.setters = [];
      link.execute = declaration;
    }
  }

  function declareModule(name, dependencies, declaration) {
    return (records[name] = {
      key: name,
      module: undefined,
      importerSetters: [],
      linkRecord: {
        deps: dependencies,
        depLoads: undefined,
        declare: declaration,
        setters: undefined,
        execute: undefined,
        moduleObj: {},
      },
    });
  }

  function defineModule(name, dependencies, lazy, initialize) {
    var initialExports = {};
    return (records[name] = {
      key: name,
      module: undefined,
      importerSetters: [],
      linkRecord: {
        deps: dependencies,
        depLoads: undefined,
        declare: undefined,
        execute: initialize,
        executingRequire: lazy,
        moduleObj: { default: initialExports, __useDefault: initialExports },
        setters: undefined,
      },
    });
  }

  function createDependencyReader(names, dependencies, executing) {
    return function (name) {
      for (var index = 0; index < names.length; index++) {
        if (names[index] === name) {
          var dependency = dependencies[index];
          var link = dependency.linkRecord;
          var namespace = link
            ? executing.indexOf(dependency) === -1
              ? executeModule(dependency, link, executing)
              : link.moduleObj
            : dependency.module;
          if ('__useDefault' in namespace) {
            return namespace.__useDefault;
          } else {
            return namespace;
          }
        }
      }
    };
  }

  function executeModule(record, link, executing) {
    executing.push(record);
    if (record.module) {
      return record.module;
    }
    if (link.setters) {
      for (var index = 0; index < link.deps.length; index++) {
        var dependency = link.depLoads[index];
        var dependencyLink = dependency.linkRecord;
        if (dependencyLink && executing.indexOf(dependency) === -1) {
          executeModule(dependency, dependencyLink, dependencyLink.setters ? executing : []);
        }
      }
      link.execute.call(declarativeReceiver);
    } else {
      var moduleRecord = { id: record.key };
      var values = link.moduleObj;
      Object.defineProperty(moduleRecord, 'exports', {
        configurable: true,
        set: function (value) {
          values.default = values.__useDefault = value;
        },
        get: function () {
          return values.__useDefault;
        },
      });
      var requireDependency = createDependencyReader(link.deps, link.depLoads, executing);
      if (!link.executingRequire) {
        for (index = 0; index < link.deps.length; index++) {
          requireDependency(link.deps[index]);
        }
      }
      var returnedExports = link.execute.call(
        hostGlobal,
        requireDependency,
        values.__useDefault,
        moduleRecord,
      );
      if (returnedExports !== undefined) {
        values.default = values.__useDefault = returnedExports;
      } else {
        if (moduleRecord.exports !== values.__useDefault) {
          values.default = values.__useDefault = moduleRecord.exports;
        }
      }
      var exportsValue = values.__useDefault;
      if (exportsValue && exportsValue.__esModule) {
        for (var name in exportsValue) {
          if (Object.hasOwnProperty.call(exportsValue, name)) {
            values[name] = exportsValue[name];
          }
        }
      }
    }
    var namespace = (record.module = new ModuleNamespace(link.moduleObj));
    if (!link.setters) {
      for (index = 0; index < record.importerSetters.length; index++) {
        record.importerSetters[index](namespace);
      }
    }
    return namespace;
  }

  function setModule(name, namespace) {
    return (records[name] = {
      key: name,
      module: namespace,
      importerSetters: [],
      linkRecord: undefined,
    });
  }

  var records = {};
  var namespaceStorage = typeof Symbol !== 'undefined' ? Symbol() : '@@baseObject';
  ModuleNamespace.prototype = Object.create(null);
  if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
    ModuleNamespace.prototype[Symbol.toStringTag] = 'Module';
  }
  var nativeRequire =
    (typeof System !== 'undefined' && System._nodeRequire) ||
    (typeof require !== 'undefined' &&
      require.resolve !== undefined &&
      typeof process !== 'undefined' &&
      process.platform &&
      require);
  var declarativeReceiver = {};
  if (Object.freeze) {
    Object.freeze(declarativeReceiver);
  }

  return function (entries, externals, useDefault, defineSources) {
    return function (publish) {
      publish(function () {
        var engineModules = {
          _nodeRequire: nativeRequire,
          declare: declareModule,
          define: defineModule,
          registry: {
            get: function (name) {
              return records[name].module;
            },
            set: setModule,
          },
          namespace: function (values) {
            return new ModuleNamespace(values);
          },
        };
        setModule('@empty', new ModuleNamespace({}));
        for (var index = 0; index < externals.length; index++) {
          setModule(externals[index], namespaceFromExternal(arguments[index]));
        }
        defineSources.call(hostGlobal, engineModules);
        var entry = loadModule(entries[0]);
        if (entries.length > 1) {
          for (index = 1; index < entries.length; index++) {
            loadModule(entries[index]);
          }
        }
        if (useDefault) {
          return entry.__useDefault;
        }
        if (entry instanceof ModuleNamespace) {
          Object.defineProperty(entry, '__esModule', { value: true });
        }
        return entry;
      });
    };
  };
}
