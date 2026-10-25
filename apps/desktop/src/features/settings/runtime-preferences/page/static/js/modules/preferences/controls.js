// Webpack module 2: controls.
// Registration order and sparse array indices are defined in bundles.json.
(function (moduleRecord, moduleExports, webpackRequire) {
  'use strict';
  webpackRequire.d(moduleExports, 'o', function () {
    return E;
  }),
    webpackRequire.d(moduleExports, 'h', function () {
      return x;
    }),
    webpackRequire.d(moduleExports, 'c', function () {
      return S;
    }),
    webpackRequire.d(moduleExports, 'k', function () {
      return InputGroup;
    }),
    webpackRequire.d(moduleExports, 'r', function () {
      return L;
    }),
    webpackRequire.d(moduleExports, 'd', function () {
      return j;
    }),
    webpackRequire.d(moduleExports, 't', function () {
      return F;
    }),
    webpackRequire.d(moduleExports, 'q', function () {
      return _;
    }),
    webpackRequire.d(moduleExports, 'b', function () {
      return P;
    }),
    webpackRequire.d(moduleExports, 's', function () {
      return M;
    }),
    webpackRequire.d(moduleExports, 'u', function () {
      return T;
    }),
    webpackRequire.d(moduleExports, 'l', function () {
      return G;
    }),
    webpackRequire.d(moduleExports, 'n', function () {
      return A;
    }),
    webpackRequire.d(moduleExports, 'f', function () {
      return I;
    }),
    webpackRequire.d(moduleExports, 'e', function () {
      return W;
    }),
    webpackRequire.d(moduleExports, 'g', function () {
      return R;
    }),
    webpackRequire.d(moduleExports, 'p', function () {
      return H;
    }),
    webpackRequire.d(moduleExports, 'j', function () {
      return z;
    }),
    webpackRequire.d(moduleExports, 'v', function () {
      return B;
    }),
    webpackRequire.d(moduleExports, 'x', function () {
      return U;
    }),
    webpackRequire.d(moduleExports, 'i', function () {
      return IconButton;
    }),
    webpackRequire.d(moduleExports, 'm', function () {
      return q;
    }),
    webpackRequire.d(moduleExports, 'a', function () {
      return $;
    }),
    webpackRequire.d(moduleExports, 'w', function () {
      return Q;
    });
  var defineProperty = webpackRequire(12),
    slicedToArray = webpackRequire(5),
    objectSpread = webpackRequire(6),
    objectWithoutProperties = webpackRequire(3),
    classCallCheck = webpackRequire(15),
    createClass = webpackRequire(16),
    assertThisInitialized = webpackRequire(11),
    inherits = webpackRequire(18),
    possibleConstructorReturn = webpackRequire(17),
    react = webpackRequire(0),
    reactDefault = webpackRequire.n(react),
    reactDom = webpackRequire(10),
    reactDomDefault = webpackRequire.n(reactDom),
    icons = webpackRequire(8),
    localization = webpackRequire(1),
    searchAndPlatform = webpackRequire(4),
    modalHook = webpackRequire(19),
    modalHookDefault = webpackRequire.n(modalHook);
  function k(WrappedControl) {
    return (function (BaseComponent) {
      Object(inherits.a)(a, BaseComponent);
      var constructParent = Object(possibleConstructorReturn.a)(a);
      function a(props) {
        var instance;
        return (
          Object(classCallCheck.a)(this, a),
          ((instance = constructParent.call(this, props)).onMouseEnter = instance.onMouseEnter.bind(
            Object(assertThisInitialized.a)(instance),
          )),
          (instance.onMouseLeave = instance.onMouseLeave.bind(
            Object(assertThisInitialized.a)(instance),
          )),
          (instance.targetRef = reactDefault.a.createRef()),
          instance
        );
      }
      return (
        Object(createClass.a)(a, [
          {
            key: 'componentDidMount',
            value: function () {
              this.tooltip = document.querySelector('#marklyra-tooltip');
            },
          },
          {
            key: '_adjustPosition',
            value: function (placement) {
              var current = this.targetRef.current,
                bounds = current.getBoundingClientRect(),
                clientWidth = this.tooltip.clientWidth,
                currentBounds = {
                  top: bounds.top + document.body.scrollTop,
                  left: bounds.left + document.body.scrollLeft,
                };
              'bottom' === placement
                ? ((currentBounds.top = bounds.bottom + 8),
                  (currentBounds.right = bounds.right + (clientWidth - bounds.width) / 2))
                : 'top' === placement
                  ? ((currentBounds.top = bounds.top - 36),
                    (currentBounds.right = bounds.right + (clientWidth - bounds.width) / 2))
                  : ((currentBounds.right = currentBounds.left - 8),
                    (currentBounds.top =
                      currentBounds.top +
                      current.clientHeight / 2 -
                      this.tooltip.clientHeight / 2)),
                clientWidth > window.innerWidth - 30
                  ? (currentBounds.left = 8)
                  : (currentBounds.left = currentBounds.right - clientWidth),
                (this.tooltip.style.top = currentBounds.top + 'px'),
                (this.tooltip.style.left = currentBounds.left + 'px'),
                currentBounds.right &&
                  (this.tooltip.style.right = window.innerWidth - currentBounds.right - 4 + 'px');
            },
          },
          {
            key: 'onMouseEnter',
            value: function () {
              var props = this.props,
                hintPosition = props.hintPosition,
                hint = props.hint;
              hint &&
                ((this.tooltip.style.right = 'auto'),
                (this.tooltip.innerHTML = hint),
                this.tooltip.classList.add('shown'),
                this._adjustPosition(hintPosition));
            },
          },
          {
            key: 'onMouseLeave',
            value: function () {
              this.tooltip.classList.remove('shown');
            },
          },
          {
            key: 'render',
            value: function () {
              return reactDefault.a.createElement(
                WrappedControl,
                Object.assign({}, this.props, {
                  ref: this.targetRef,
                  onMouseEnter: this.onMouseEnter,
                  onMouseLeave: this.onMouseLeave,
                }),
              );
            },
          },
        ]),
        a
      );
    })(reactDefault.a.Component);
  }
  var E = function (panelProps) {
      var active = panelProps.active,
        children = panelProps.children,
        containerProps = Object(objectWithoutProperties.a)(panelProps, ['active', 'children']),
        ref = reactDefault.a.useRef(null);
      return (
        reactDefault.a.useEffect(function () {
          if (active && ref.current) {
            var domNode = ref.current,
              element = domNode.querySelector('.search-hit, .blink-area');
            if (element) {
              var bounds = element.getBoundingClientRect();
              bounds.top + 20 > domNode.parentElement.scrollTop + window.innerHeight &&
                (domNode.parentElement.scrollTop = bounds.top - 20);
            }
          }
        }),
        reactDefault.a.createElement(
          'div',
          Object.assign(
            { ref: ref, className: 'content' + (active ? '' : ' display-none') },
            containerProps,
          ),
          children,
        )
      );
    },
    C = function (linkProps) {
      var text = linkProps.text,
        link = linkProps.link;
      return link
        ? reactDefault.a.createElement(
            'a',
            {
              href: link,
              target: '_blank',
              onClick: function (clickEvent) {
                window.Setting.openLink(link), clickEvent.preventDefault();
              },
            },
            Object(localization.a)(text),
          )
        : Object(localization.a)(text);
    },
    x = function (hintProps) {
      var hint = hintProps.hint,
        displayHint = hintProps.displayHint,
        inlineHint = hintProps.inlineHint,
        hintLink = hintProps.hintLink,
        extraProps = Object(objectWithoutProperties.a)(hintProps, [
          'hint',
          'displayHint',
          'inlineHint',
          'hintLink',
        ]);
      return displayHint
        ? reactDefault.a.createElement('div', { className: 'panel-content-hint row' }, hint)
        : inlineHint
          ? reactDefault.a.createElement(
              'div',
              { className: 'inline-hint' },
              hint ? reactDefault.a.createElement(C, { link: hintLink, text: hint }) : null,
            )
          : reactDefault.a.createElement(
              HintIcon,
              Object.assign(
                { hint: hint ? Object(localization.a)(hint) : hintLink, hintLink: hintLink },
                extraProps,
              ),
            );
    },
    HintIcon = k(
      reactDefault.a.forwardRef(function (hintProps, ref) {
        var hint = hintProps.hint,
          hintLink = hintProps.hintLink,
          extraProps =
            (hintProps.forwardedRef,
            Object(objectWithoutProperties.a)(hintProps, ['hint', 'hintLink', 'forwardedRef']));
        return hintLink
          ? reactDefault.a.createElement(
              'span',
              Object.assign({ ref: ref, className: 'label-hint', hint: hint }, extraProps),
              reactDefault.a.createElement(
                'a',
                {
                  href: hintLink,
                  target: '_blank',
                  onClick: function (clickEvent) {
                    window.Setting.openLink(hintLink), clickEvent.preventDefault();
                  },
                },
                ' ',
                reactDefault.a.createElement(icons.i, null),
              ),
            )
          : reactDefault.a.createElement(
              'span',
              Object.assign({ ref: ref, className: 'label-hint', hint: hint }, extraProps),
              reactDefault.a.createElement(icons.i, null),
            );
      }),
    ),
    S = function (checkboxProps) {
      var keyName = checkboxProps.keyName,
        label = checkboxProps.label,
        dictGroup = checkboxProps.dictGroup,
        checked = checkboxProps.checked,
        reverse = checkboxProps.reverse,
        onChange = checkboxProps.onChange,
        hint = checkboxProps.hint,
        hintLink = checkboxProps.hintLink,
        inlineHint = checkboxProps.inlineHint,
        isCell = checkboxProps.isCell,
        disabled = checkboxProps.disabled,
        highlight = checkboxProps.highlight,
        extraProps = Object(objectWithoutProperties.a)(checkboxProps, [
          'keyName',
          'label',
          'dictGroup',
          'checked',
          'reverse',
          'onChange',
          'hint',
          'hintLink',
          'inlineHint',
          'isCell',
          'disabled',
          'highlight',
        ]),
        searchQuery = reactDefault.a.useContext(searchAndPlatform.a),
        searchClass =
          !isCell &&
          searchQuery &&
          (Object(searchAndPlatform.c)(searchQuery, label, dictGroup) ||
            Object(searchAndPlatform.c)(searchQuery, hint))
            ? ' search-hit'
            : '';
      return reactDefault.a.createElement(
        'div',
        Object.assign(
          {
            className:
              'checkbox' +
              (isCell ? '' : ' row') +
              searchClass +
              (disabled ? ' disabled' : '') +
              (highlight ? ' blink-area' : ''),
          },
          extraProps,
        ),
        reactDefault.a.createElement(
          'label',
          null,
          reactDefault.a.createElement('input', {
            type: 'checkbox',
            onChange: function (changeEvent) {
              onChange(keyName, reverse ? !changeEvent.target.checked : changeEvent.target.checked);
            },
            checked: !!checked,
            disabled: disabled,
          }),
          Object(localization.a)(label, dictGroup),
        ),
        '\xa0',
        hint || hintLink
          ? reactDefault.a.createElement(x, {
              hint: hint,
              inlineHint: inlineHint,
              hintLink: hintLink,
            })
          : null,
      );
    },
    InputGroup = reactDefault.a.memo(function (groupProps) {
      var title = groupProps.title,
        dictGroup = groupProps.dictGroup,
        hint = groupProps.hint,
        contentStyle = groupProps.contentStyle,
        hintLink = groupProps.hintLink,
        breakBeforeHint = groupProps.breakBeforeHint,
        children = groupProps.children,
        headerStyle = groupProps.headerStyle,
        keyWords = groupProps.keyWords,
        highlight = groupProps.highlight,
        searchQuery = reactDefault.a.useContext(searchAndPlatform.a),
        matchesSearch =
          Object(searchAndPlatform.c)(searchQuery, title, dictGroup) ||
          Object(searchAndPlatform.c)(searchQuery, hint) ||
          (keyWords && Object(searchAndPlatform.d)(searchQuery, keyWords));
      return reactDefault.a.createElement(
        'div',
        {
          className:
            'input-group' + (matchesSearch ? ' search-hit' : '') + (highlight ? ' blink-area' : ''),
        },
        reactDefault.a.createElement(
          'h5',
          { className: 'input-group-header', style: headerStyle },
          reactDefault.a.createElement(
            'span',
            { className: 'input-group-header-title' },
            Object(localization.a)(title, dictGroup),
          ),
          hint || hintLink
            ? reactDefault.a.createElement(
                'span',
                {
                  className:
                    'input-group-header-hint' + (breakBeforeHint ? ' hint-break-before' : ''),
                },
                hint ? reactDefault.a.createElement(C, { link: hintLink, text: hint }) : null,
              )
            : null,
        ),
        reactDefault.a.createElement(
          'div',
          { className: 'input-group-content', style: contentStyle },
          children,
        ),
      );
    }),
    L = function (selectProps) {
      var keyName = selectProps.keyName,
        isCell = selectProps.isCell,
        options = selectProps.options,
        optionsList = selectProps.optionsList,
        selectedValue = selectProps.value,
        type = selectProps.type,
        hint = selectProps.hint,
        inlineHint = selectProps.inlineHint,
        optionsDict = selectProps.optionsDict,
        onChange = selectProps.onChange,
        disabled = selectProps.disabled,
        extraProps = Object(objectWithoutProperties.a)(selectProps, [
          'keyName',
          'isCell',
          'options',
          'optionsList',
          'value',
          'type',
          'hint',
          'inlineHint',
          'optionsDict',
          'onChange',
          'disabled',
        ]),
        searchQuery = reactDefault.a.useContext(searchAndPlatform.a),
        searchClass =
          searchQuery &&
          !isCell &&
          (Object(searchAndPlatform.d)(searchQuery, Object.values(options || {}), optionsDict) ||
            Object(searchAndPlatform.c)(searchQuery, hint))
            ? ' search-hit'
            : '';
      return reactDefault.a.createElement(
        'div',
        Object.assign({ className: (isCell ? 'cell' : 'row') + searchClass }, extraProps),
        reactDefault.a.createElement(
          'select',
          {
            onChange: function (changeEvent) {
              var nextValue = changeEvent.target.value;
              'number' == type
                ? (nextValue = changeEvent.target.value - 0)
                : 'boolean' == type && (nextValue = changeEvent.target.value + '' == 'true'),
                onChange(keyName, nextValue);
            },
            value: selectedValue,
            disabled: disabled,
          },
          (function () {
            var items = [];
            if (optionsList)
              for (var key in optionsList) {
                var optionEntry = optionsList[key];
                '_seperator' === optionEntry[0]
                  ? items.push(
                      reactDefault.a.createElement(
                        'option',
                        { key: currentKey, disabled: !0 },
                        '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
                      ),
                    )
                  : items.push(
                      reactDefault.a.createElement(
                        'option',
                        { key: key, value: optionEntry[0] },
                        Object(localization.a)(optionEntry[1], optionsDict),
                      ),
                    );
              }
            else
              for (var currentKey in options)
                '_seperator' == currentKey
                  ? items.push(
                      reactDefault.a.createElement(
                        'option',
                        { key: currentKey, disabled: !0 },
                        '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
                      ),
                    )
                  : '' == options[currentKey] ||
                    items.push(
                      reactDefault.a.createElement(
                        'option',
                        { key: currentKey, value: currentKey },
                        Object(localization.a)(options[currentKey], optionsDict),
                      ),
                    );
            return items;
          })(),
        ),
        hint ? reactDefault.a.createElement(x, { hint: hint, inlineHint: inlineHint }) : null,
      );
    },
    j = function (platformProps) {
      var forMac = platformProps.forMac,
        forWin = platformProps.forWin,
        forLinux = platformProps.forLinux,
        visible = platformProps.visible,
        children = platformProps.children;
      return (function (showContent) {
        return (showContent =
          showContent ||
          (forMac && window.isMac) ||
          (forWin && window.isWin) ||
          (forLinux && window.isLinux))
          ? reactDefault.a.createElement(reactDefault.a.Fragment, null, children)
          : null;
      })(visible);
    },
    F = function (labelProps) {
      var label = labelProps.label,
        style = labelProps.style;
      return reactDefault.a.createElement('span', { style: style }, Object(localization.a)(label));
    },
    _ = function (rowProps) {
      var keyWords = rowProps.keyWords,
        style = rowProps.style,
        children = rowProps.children,
        className = rowProps.className,
        searchQuery = reactDefault.a.useContext(searchAndPlatform.a),
        searchClass =
          searchQuery && keyWords && Object(searchAndPlatform.d)(searchQuery, keyWords)
            ? ' search-hit'
            : '';
      return reactDefault.a.createElement(
        'div',
        { className: 'row' + searchClass + ' ' + className, style: style },
        children,
      );
    },
    P = function (buttonProps) {
      var label = buttonProps.label,
        style = buttonProps.style,
        type = buttonProps.type,
        extraProps = Object(objectWithoutProperties.a)(buttonProps, ['label', 'style', 'type']);
      return (
        (type = type || 'default'),
        reactDefault.a.createElement(
          'button',
          Object.assign(
            {
              'aria-label': Object(localization.a)(label),
              style: Object(objectSpread.a)({}, style),
              className: 'btn btn-'.concat(type),
            },
            extraProps,
          ),
          Object(localization.a)(label),
        )
      );
    },
    M = function (splitButtonProps) {
      var label = splitButtonProps.label,
        style = splitButtonProps.style,
        options = splitButtonProps.options,
        onExtra = splitButtonProps.onExtra,
        extraProps = Object(objectWithoutProperties.a)(splitButtonProps, [
          'label',
          'style',
          'options',
          'onExtra',
        ]),
        ref = reactDefault.a.useRef(null);
      return reactDefault.a.createElement(
        'div',
        { className: 'btn-split-group' },
        reactDefault.a.createElement(
          'button',
          Object.assign(
            {
              'aria-label': Object(localization.a)(label),
              style: Object(objectSpread.a)({}, style),
              className: 'btn btn-default btn-split-left',
            },
            extraProps,
          ),
          reactDefault.a.createElement(
            'span',
            { className: 'btn-split-main' },
            Object(localization.a)(label),
          ),
        ),
        reactDefault.a.createElement(
          'button',
          {
            'tab-index': -1,
            'aria-label': Object(localization.a)(label),
            style: Object(objectSpread.a)({}, style),
            className: 'btn btn-default btn-split-right',
            onClick: function (clickEvent) {
              clickEvent.currentTarget.focus();
              var classList = ref.current.classList;
              classList.contains('shown') ? classList.remove('shown') : classList.add('shown');
            },
            onBlur: function () {
              ref.current.classList.remove('shown');
            },
          },
          reactDefault.a.createElement('span', { className: 'icon icon-down-dir' }),
        ),
        reactDefault.a.createElement(
          'ul',
          { className: 'dropdown-menu', ref: ref },
          Object.keys(options).map(function (key) {
            return reactDefault.a.createElement(
              'li',
              {
                key: key,
                onMouseDown: function () {
                  onExtra(key - 0), ref.current.classList.remove('shown');
                },
              },
              Object(localization.a)(options[key]),
            );
          }),
        ),
      );
    },
    T = function (inputProps) {
      var keyName = inputProps.keyName,
        searchValue = inputProps.value,
        suggest = inputProps.suggest,
        placeholder = inputProps.placeholder,
        onChange = inputProps.onChange,
        disabled = inputProps.disabled,
        presetOptions = inputProps.presetOptions,
        indent = inputProps.indent,
        extraProps = Object(objectWithoutProperties.a)(inputProps, [
          'keyName',
          'value',
          'suggest',
          'placeholder',
          'onChange',
          'disabled',
          'presetOptions',
          'indent',
        ]),
        presetControl = null;
      if (presetOptions) {
        var presetLabels = {};
        presetOptions.map(function (item) {
          return (presetLabels[item] = item);
        }),
          (presetControl = reactDefault.a.createElement(
            reactDefault.a.Fragment,
            null,
            reactDefault.a.createElement(IconButton, { icon: 'dot-3' }),
            reactDefault.a.createElement(
              'select',
              {
                onChange: function (changeEvent) {
                  '_none' === changeEvent.target.value
                    ? onChange(keyName, '')
                    : changeEvent.target.value && onChange(keyName, changeEvent.target.value);
                },
                value:
                  presetOptions.indexOf(searchValue) > -1
                    ? searchValue
                    : searchValue
                      ? ''
                      : '_none',
              },
              reactDefault.a.createElement(
                'option',
                { value: '' },
                Object(localization.a)('Custom'),
              ),
              presetOptions.map(function (key) {
                return reactDefault.a.createElement('option', { key: key, value: key }, key);
              }),
              reactDefault.a.createElement(
                'option',
                { value: '_none' },
                Object(localization.a)('None'),
              ),
            ),
          ));
      }
      return reactDefault.a.createElement(
        'div',
        {
          className: 'row text-input marklyra-text-input ',
          style: indent ? { paddingLeft: indent } : void 0,
        },
        suggest
          ? reactDefault.a.createElement(
              G,
              Object.assign(
                {
                  value: searchValue,
                  onChange: function (nextValue) {
                    return onChange(keyName, nextValue);
                  },
                  candidates: suggest,
                  placeholder: placeholder,
                },
                extraProps,
              ),
            )
          : reactDefault.a.createElement(
              'input',
              Object.assign(
                {
                  type: 'text',
                  value: searchValue,
                  onChange: function (changeEvent) {
                    return onChange(keyName, changeEvent.target.value);
                  },
                  disabled: disabled,
                  placeholder: Object(localization.a)(placeholder),
                },
                extraProps,
              ),
            ),
        presetControl || null,
      );
    },
    A = function (numberProps) {
      var numberValue = numberProps.value,
        keyName = numberProps.keyName,
        onChange = numberProps.onChange,
        inputAttributes = Object(objectWithoutProperties.a)(numberProps, [
          'value',
          'keyName',
          'onChange',
        ]);
      return reactDefault.a.createElement(
        'input',
        Object.assign(
          {
            type: 'number',
            value: numberValue,
            onChange: function (changeEvent) {
              var nextNumber = changeEvent.target.value - 0;
              isNaN(nextNumber)
                ? onChange(keyName, '382')
                : nextNumber < inputAttributes.min
                  ? onChange(keyName, '1')
                  : nextNumber > inputAttributes.max
                    ? onChange(keyName, '999')
                    : onChange(keyName, nextNumber);
            },
          },
          inputAttributes,
        ),
      );
    },
    IconButton = k(
      reactDefault.a.forwardRef(function (iconProps, ref) {
        var icon = iconProps.icon,
          hint = (iconProps.label, iconProps.hint),
          disabled = (iconProps.hintPosition, iconProps.disabled),
          extraProps = Object(objectWithoutProperties.a)(iconProps, [
            'icon',
            'label',
            'hint',
            'hintPosition',
            'disabled',
          ]);
        return reactDefault.a.createElement(
          'span',
          Object.assign(
            {
              role: 'button',
              className: 'icon-button icon icon-' + icon + (disabled ? ' button-disabled' : ''),
              'aria-label': hint,
              ref: ref,
            },
            extraProps,
          ),
        );
      }),
    ),
    W = function (filePickerProps) {
      var keyName = filePickerProps.keyName,
        filePath = filePickerProps.value,
        defaultPath = filePickerProps.defaultPath,
        placeholder = filePickerProps.placeholder,
        onChange = filePickerProps.onChange,
        option = filePickerProps.option;
      return reactDefault.a.createElement(
        'div',
        { className: 'file-input' },
        reactDefault.a.createElement('input', {
          type: 'text',
          value: filePath || '',
          onChange: function (changeEvent) {
            onChange(keyName, changeEvent.target.value);
          },
          placeholder: placeholder,
        }),
        reactDefault.a.createElement(IconButton, {
          hint: Object(localization.a)('Select'),
          icon: 'folder',
          style: { marginLeft: '1ch', cursor: 'pointer' },
          onClick: function () {
            var initialPath = filePath || defaultPath;
            window.Setting.selectFile(initialPath, [option], function (selectedPath) {
              selectedPath && onChange(keyName, selectedPath);
            });
          },
          hintPosition: 'bottom',
        }),
      );
    },
    SelectControl = k(
      reactDefault.a.forwardRef(function (directoryProps, ref) {
        var directoryPath = directoryProps.value,
          onSelect = directoryProps.onSelect,
          extraProps =
            (directoryProps.hintPosition,
            Object(objectWithoutProperties.a)(directoryProps, [
              'value',
              'onSelect',
              'hintPosition',
            ])),
          directoryLabel = (directoryPath || '').replace(/[\\\/]\s*$/, '').replace(/.*[\\\/]/, '');
        return (
          '/' == directoryPath && (directoryLabel = '/'),
          reactDefault.a.createElement(
            'span',
            Object.assign(
              {
                ref: ref,
                type: 'text',
                className: 'dir-path',
                placeholder: Object(localization.a)('Select Custom Folder...'),
                readOnly: !0,
                onClick: function () {
                  directoryPath ? window.Setting.openFolder(directoryPath) : onSelect();
                },
              },
              extraProps,
            ),
            directoryLabel || Object(localization.a)('Select Custom Folder...'),
          )
        );
      }),
    ),
    I = function (folderPickerProps) {
      var hidden = folderPickerProps.hidden,
        hint = folderPickerProps.value,
        keyName = folderPickerProps.keyName,
        onChange = folderPickerProps.onChange,
        onSelect =
          (Object(objectWithoutProperties.a)(folderPickerProps, [
            'hidden',
            'value',
            'keyName',
            'onChange',
          ]),
          function () {
            window.Setting.selectFolder(hint, function (selectedDirectory) {
              var nextDirectory = selectedDirectory || hint;
              nextDirectory && onChange(keyName, nextDirectory);
            });
          });
      return hidden
        ? null
        : reactDefault.a.createElement(
            'div',
            { className: 'row' },
            reactDefault.a.createElement(
              'div',
              { className: 'select-pin-input-group' },
              reactDefault.a.createElement(SelectControl, {
                hint: hint,
                value: hint,
                onSelect: onSelect,
                hintPosition: 'bottom',
              }),
              reactDefault.a.createElement(IconButton, {
                icon: 'folder',
                onClick: onSelect,
                hint: Object(localization.a)('Select custom folder'),
                hintPosition: 'bottom',
              }),
            ),
          );
    },
    R = function (fontSizeProps) {
      var useCustomFontSize = fontSizeProps.value,
        customValue = fontSizeProps.customValue,
        onChange = fontSizeProps.onChange,
        fontSizeState = reactDefault.a.useState(customValue || 14),
        fontSizePair = Object(slicedToArray.a)(fontSizeState, 2),
        fontSizeDraft = fontSizePair[0],
        setFontSizeDraft = fontSizePair[1];
      var showCustomInput,
        u = function (changeEvent) {
          'radio' === changeEvent.target.type &&
            onChange('useCustomFontSize', changeEvent.target.value + '' === 'true');
        };
      return reactDefault.a.createElement(
        'div',
        { className: 'row' },
        reactDefault.a.createElement(
          'span',
          { className: 'radio', style: { minWidth: '40%', paddingRight: '8px', height: '26px' } },
          reactDefault.a.createElement(
            'label',
            { style: { overflow: 'visible' } },
            reactDefault.a.createElement('input', {
              type: 'radio',
              name: 'useCustomFontSize',
              value: !1,
              checked: !1 === useCustomFontSize,
              onChange: u,
            }),
            Object(localization.a)('Auto ( Recommended )'),
          ),
        ),
        reactDefault.a.createElement(
          'span',
          { className: 'radio', style: { width: '40%', height: '26px' } },
          reactDefault.a.createElement(
            'label',
            { style: { overflow: 'visible', whiteSpace: 'nowrap' } },
            reactDefault.a.createElement('input', {
              type: 'radio',
              name: 'useCustomFontSize',
              value: !0,
              checked: !0 === useCustomFontSize,
              onChange: u,
            }),
            Object(localization.a)('Customized'),
            ((showCustomInput = useCustomFontSize + '' === 'true'),
            reactDefault.a.createElement(
              'span',
              {
                className: 'custom-font-input',
                style: { visibility: showCustomInput ? 'visible' : 'hidden' },
              },
              reactDefault.a.createElement('input', {
                style: { marginLeft: '8px', marginTop: '-4px' },
                step: '1',
                type: 'number',
                max: '24',
                size: '2',
                min: '9',
                value: fontSizeDraft,
                onChange: function (changeEvent) {
                  var nextSize = changeEvent.target.value - 0;
                  isNaN(nextSize) ||
                    (setFontSizeDraft(Math.floor(nextSize)),
                    nextSize <= 24 && nextSize >= 9 && onChange('customFontSize', nextSize));
                },
                onBlur: function () {
                  var clampedSize = fontSizeDraft;
                  clampedSize > 24 && (clampedSize = 24),
                    clampedSize < 9 && (clampedSize = 9),
                    setFontSizeDraft(clampedSize),
                    onChange('customFontSize', clampedSize);
                },
              }),
              ' ',
              reactDefault.a.createElement('span', null, 'px'),
            )),
          ),
        ),
      );
    },
    H = function (radioProps) {
      var keyName = radioProps.keyName,
        selectedValue = radioProps.value,
        type = radioProps.type,
        options = radioProps.options,
        onChange = radioProps.onChange;
      Object(objectWithoutProperties.a)(radioProps, [
        'keyName',
        'value',
        'type',
        'options',
        'onChange',
      ]);
      return reactDefault.a.createElement(
        'div',
        {
          className: 'row',
          onChange: function (changeEvent) {
            var nextValue = changeEvent.target.value;
            'number' == type
              ? (nextValue = changeEvent.target.value - 0)
              : 'boolean' == type && (nextValue = changeEvent.target.value + '' == 'true'),
              onChange(keyName, nextValue);
          },
          value: selectedValue,
        },
        (function () {
          var items = [];
          for (var key in options)
            items.push(
              reactDefault.a.createElement(
                'span',
                { key: key, className: 'radio', style: { width: '40%' } },
                reactDefault.a.createElement(
                  'label',
                  null,
                  reactDefault.a.createElement('input', {
                    type: 'radio',
                    name: keyName,
                    value: key,
                    defaultChecked: selectedValue + '' == key,
                  }),
                  Object(localization.a)(options[key]),
                ),
              ),
            );
          return items;
        })(),
      );
    },
    z = function (indentProps) {
      var currentIndentSize,
        currentPrettyIndent,
        indentSize = indentProps.indentSize,
        prettyIndent = indentProps.prettyIndent,
        extraProps = Object(objectWithoutProperties.a)(indentProps, ['indentSize', 'prettyIndent']);
      return (
        (indentSize -= 0),
        (prettyIndent = prettyIndent + '' === 'true'),
        reactDefault.a.createElement(
          InputGroup,
          {
            title: 'Indent Size on Save',
            breakBeforeHint: !0,
            hint: 'only apply to quotes and lists created from menu bar or hybrid view',
            headerStyle: { marginBottom: '0' },
          },
          reactDefault.a.createElement(B, {
            rows: [
              [
                reactDefault.a.createElement(
                  'div',
                  null,
                  reactDefault.a.createElement(
                    L,
                    Object.assign(
                      {
                        keyName: 'indentSize',
                        style: { width: '80px', minHeight: '25px' },
                        options: { 0: 'Auto', 2: '2', 3: '3', 4: '4', 5: '5', '-1': 'Tab' },
                        isCell: !0,
                      },
                      extraProps,
                      {
                        onChange: function (settingKey, nextValue) {
                          extraProps.onChange(settingKey, nextValue - 0);
                        },
                        value: (indentSize || 0) + '',
                      },
                    ),
                  ),
                  reactDefault.a.createElement(
                    S,
                    Object.assign(
                      {
                        keyName: 'prettyIndent',
                        style: { marginTop: '8px' },
                        label: 'Pretty indentation',
                        isCell: !0,
                      },
                      extraProps,
                      { checked: !!prettyIndent },
                    ),
                  ),
                ),
                reactDefault.a.createElement(
                  'div',
                  { style: { marginTop: '4px', border: '1px solid', padding: '0 8px' } },
                  reactDefault.a.createElement(
                    'pre',
                    { style: { margin: '0', lineHeight: '1.5' } },
                    ((currentIndentSize = indentSize),
                    (currentPrettyIndent = prettyIndent),
                    (currentIndentSize = currentIndentSize || 2) < 0
                      ? '> Quote\n- List item\n\t1. sub-bullet\n\t\tline2'
                      : (currentPrettyIndent
                          ? [
                              '> Quote\n- List item\n  1. sub-bullet\n     line2',
                              '>  Quote\n-  List item\n   1. sub-bullet\n      line2',
                              '>   Quote\n-   List item\n    1.  sub-bullet\n        line2',
                              '>    Quote\n-    List item\n     1.   sub-bullet\n          line2',
                            ]
                          : [
                              '> Quote\n- List item\n  1. sub-bullet\n     line2',
                              '> Quote\n- List item\n   1. sub-bullet\n      line2',
                              '> Quote\n- List item\n    1. sub-bullet\n        line2',
                              '> Quote\n- List item\n     1. sub-bullet\n          line2',
                            ])[(currentIndentSize || 2) - 2]),
                  ),
                ),
              ],
            ],
          }),
        )
      );
    },
    B = function (tableProps) {
      var className = tableProps.className,
        rows = tableProps.rows,
        style = tableProps.style,
        searchQuery = reactDefault.a.useContext(searchAndPlatform.a);
      return reactDefault.a.createElement(
        'table',
        { className: 'label-input-group ' + (className || ''), style: style },
        reactDefault.a.createElement(
          'tbody',
          null,
          rows.map(function (item, itemIndex) {
            var searchLabel = item[2] || item[0],
              currentClassName =
                searchQuery &&
                'string' == typeof searchLabel &&
                Object(searchAndPlatform.c)(searchQuery, searchLabel)
                  ? 'search-hit'
                  : '';
            return 1 == item.length
              ? reactDefault.a.createElement(
                  'tr',
                  { key: itemIndex, className: currentClassName },
                  reactDefault.a.createElement(
                    'td',
                    { colspan: '2' },
                    'string' == typeof item[0] ? Object(localization.a)(item[0]) : item[0],
                  ),
                )
              : reactDefault.a.createElement(
                  'tr',
                  { key: itemIndex, className: currentClassName },
                  reactDefault.a.createElement(
                    'td',
                    null,
                    'string' == typeof item[0] ? Object(localization.a)(item[0]) : item[0],
                  ),
                  reactDefault.a.createElement('td', null, item[1]),
                  item[2]
                    ? 0 == item[2].indexOf('https:')
                      ? reactDefault.a.createElement(x, { hintLink: item[2] })
                      : reactDefault.a.createElement(x, { hint: item[2] })
                    : null,
                );
          }),
        ),
      );
    },
    U = function () {
      return reactDefault.a.createElement(
        'header',
        { className: 'window-header' },
        reactDefault.a.createElement(
          'div',
          { className: 'window-header-content' },
          reactDefault.a.createElement(
            'div',
            { className: 'window-header-title' },
            reactDefault.a.createElement(
              'button',
              { className: 'window-header-back', onClick: window.Setting.close },
              reactDefault.a.createElement(
                'span',
                { className: 'icon' },
                reactDefault.a.createElement(icons.b, null),
              ),
            ),
            reactDefault.a.createElement('h2', null, Object(localization.a)('Preferences')),
          ),
        ),
        reactDefault.a.createElement(
          'button',
          { className: 'header-close', onClick: window.Setting.close },
          reactDefault.a.createElement(
            'span',
            { className: 'icon' },
            reactDefault.a.createElement(icons.c, null),
          ),
        ),
      );
    },
    q = function (modalProps) {
      return reactDomDefault.a.createPortal(
        reactDefault.a.createElement(
          'div',
          { className: 'modal-backdrop' },
          reactDefault.a.createElement(
            'div',
            {
              className: 'modal-content ' + (modalProps.className || ''),
              onKeyDown: modalProps.onKeyDown,
            },
            reactDefault.a.createElement(
              'div',
              { className: 'modal-icon', style: { display: 'none', textAlign: 'center' } },
              reactDefault.a.createElement('img', { src: '/icon.png', style: { width: '64px' } }),
            ),
            void 0 === modalProps.title
              ? null
              : reactDefault.a.createElement(
                  'div',
                  { className: 'modal-title' },
                  reactDefault.a.createElement(
                    'h3',
                    null,
                    Object(localization.a)(modalProps.title),
                  ),
                ),
            reactDefault.a.createElement('div', { className: 'modal-body' }, modalProps.children),
            reactDefault.a.createElement(
              'div',
              { className: 'modal-footer' },
              modalProps.footer
                ? modalProps.footer
                : reactDefault.a.createElement(
                    'div',
                    null,
                    reactDefault.a.createElement(
                      'button',
                      { className: 'btn btn-primary', onClick: modalProps.closeAction },
                      Object(localization.a)('OK'),
                    ),
                  ),
            ),
          ),
        ),
        document.querySelector('#modal'),
      );
    },
    G = function (autocompleteProps) {
      var inputAttributes,
        candidates = autocompleteProps.candidates,
        text = autocompleteProps.value,
        onChange = autocompleteProps.onChange,
        placeholder = autocompleteProps.placeholder,
        extraProps = Object(objectWithoutProperties.a)(autocompleteProps, [
          'candidates',
          'value',
          'onChange',
          'placeholder',
        ]),
        focusState = reactDefault.a.useState(!1),
        focusPair = Object(slicedToArray.a)(focusState, 2),
        focused = focusPair[0],
        setFocused = focusPair[1],
        activeIndexState = reactDefault.a.useState(-1),
        activeIndexPair = Object(slicedToArray.a)(activeIndexState, 2),
        activeIndex = activeIndexPair[0],
        setActiveIndex = activeIndexPair[1],
        suggestionsState = reactDefault.a.useState(!0),
        suggestionsPair = Object(slicedToArray.a)(suggestionsState, 2),
        suggestionsEnabled = suggestionsPair[0],
        setSuggestionsEnabled = suggestionsPair[1],
        ref = reactDefault.a.useRef(null),
        Portal = modalHookDefault()().Portal,
        currentRef = reactDefault.a.useRef(null),
        filteredItems = candidates.filter(function (key) {
          return !text || 0 == (key.key || key || '').indexOf(text.toLowerCase());
        }),
        renderSuggestions = reactDefault.a.useCallback(
          function () {
            return (
              (text = text || ''),
              reactDefault.a.createElement(
                'div',
                { ref: currentRef, className: 'input-autocomplete' },
                filteredItems.map(function (key, itemIndex) {
                  var currentKey = key.key || key,
                    optionLabel = key.label || key;
                  return reactDefault.a.createElement(
                    'div',
                    {
                      className: 'input-autocomplete-row '.concat(
                        itemIndex == activeIndex ? 'active' : '',
                      ),
                      key: currentKey,
                      onMouseDown: function (mouseEvent) {
                        onChange(currentKey),
                          mouseEvent.preventDefault(),
                          mouseEvent.stopPropagation(),
                          _();
                      },
                      style: key.key ? { borderBottom: '1px solid #aaa' } : {},
                    },
                    optionLabel,
                  );
                }),
              )
            );
          },
          [filteredItems],
        ),
        F = function (nextValue) {
          setActiveIndex(-1), setSuggestionsEnabled(!0), onChange(nextValue);
        },
        _ = function () {
          ref.current && (ref.current.select(), setSuggestionsEnabled(!1));
        };
      return (
        reactDefault.a.useEffect(
          function () {
            if (focused && currentRef.current) {
              var bounds = ref.current.getBoundingClientRect(),
                scrollTop = document.body.scrollTop;
              (currentRef.current.style.top = bounds.bottom + 2 + scrollTop + 'px'),
                (currentRef.current.style.width = bounds.width + 'px'),
                (currentRef.current.style.left = bounds.left + 'px');
            }
          },
          [focused, currentRef.current],
        ),
        reactDefault.a.useEffect(
          function () {
            if (!(activeIndex < 0) && currentRef.current) {
              var current = currentRef.current,
                activeRow = current.children[activeIndex];
              if (activeRow) {
                var scrollTop = current.scrollTop,
                  offsetTop = activeRow.offsetTop;
                (offsetTop > scrollTop + 180 - 8 || offsetTop + 30 < scrollTop + 8) &&
                  (current.scrollTop = offsetTop);
              }
            }
          },
          [activeIndex],
        ),
        reactDefault.a.createElement(
          reactDefault.a.Fragment,
          null,
          reactDefault.a.createElement(
            'input',
            Object.assign(
              ((inputAttributes = {
                spellcheck: !1,
                ref: ref,
                type: 'text',
                className: 'marklyra-text-input',
                onFocus: function (focusEvent) {
                  focusEvent.target.select(), setFocused(!0), setSuggestionsEnabled(!0);
                },
                onBlur: function () {
                  setFocused(!1);
                },
                value: text || '',
              }),
              Object(defineProperty.a)(inputAttributes, 'type', 'text'),
              Object(defineProperty.a)(inputAttributes, 'onChange', function (changeEvent) {
                return F(changeEvent.target.value);
              }),
              Object(defineProperty.a)(
                inputAttributes,
                'placeholder',
                Object(localization.a)(placeholder || ''),
              ),
              Object(defineProperty.a)(inputAttributes, 'onKeyDown', function (keyboardEvent) {
                'Enter' === keyboardEvent.key
                  ? (activeIndex >= 0 && F(filteredItems[activeIndex]), setSuggestionsEnabled(!1))
                  : 'Esc' === keyboardEvent.key
                    ? setSuggestionsEnabled(!1)
                    : 'ArrowUp' === keyboardEvent.key
                      ? (setActiveIndex(
                          activeIndex - 1 < 0 ? filteredItems.length - 1 : activeIndex - 1,
                        ),
                        setSuggestionsEnabled(!0))
                      : 'ArrowDown' === keyboardEvent.key &&
                        (activeIndex + 1 > filteredItems.length
                          ? setActiveIndex(0)
                          : setActiveIndex(activeIndex + 1),
                        setSuggestionsEnabled(!0));
              }),
              inputAttributes),
              extraProps,
            ),
          ),
          filteredItems.length && suggestionsEnabled && focused
            ? reactDefault.a.createElement(Portal, null, renderSuggestions())
            : null,
        )
      );
    },
    $ = function () {
      return reactDefault.a.createElement(
        reactDefault.a.Fragment,
        null,
        reactDefault.a.createElement(
          'style',
          null,
          '\n      .backdrop {\n        position: absolute;\n        top: 122px;\n        bottom: 0;\n        left: 0;\n        right: 0;\n        backdrop-filter: blur(5px);\n        -webkit-backdrop-filter: blur(5px);\n      }\n      \n      .backdrop .lds-spinner {\n        zoom: 0.8;\n        margin-top: 23vh;\n      }\n    ',
        ),
        reactDefault.a.createElement(
          'div',
          { className: 'backdrop' },
          reactDefault.a.createElement(
            'div',
            { className: 'lds-spinner' },
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
            reactDefault.a.createElement('div', null),
          ),
        ),
      );
    },
    Q = function (helpProps) {
      var text = helpProps.text,
        link = helpProps.link,
        app = helpProps.app,
        helpUrl = 'https://github.com/Refinex-Space/marklyra'.concat(link);
      return (
        app.getValue('useMirrorInCN') &&
          (helpUrl = 'https://github.com/Refinex-Space/marklyra'.concat(link)),
        reactDefault.a.createElement(
          'div',
          { className: 'warning-panel' },
          reactDefault.a.createElement(
            _,
            null,
            '\u26a0 ',
            reactDefault.a.createElement('span', null, Object(localization.a)(text)),
            ' ',
            null,
          ),
        )
      );
    };
});
