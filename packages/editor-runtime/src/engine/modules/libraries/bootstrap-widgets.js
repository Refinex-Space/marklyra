// Install this compatibility library in the supplied engine environment.
export default function installLibrariesBootstrapWidgets(engineModules, vendorScope) {
  // libraries/bootstrap-widgets.
  // Vendor adapter; version and local behavior are preserved.
  engineModules.define(
    'libraries/bootstrap-widgets',
    ['libraries/jquery'],
    true,
    function (requireModule, moduleExports, moduleRecord) {
      'use strict';
      if (!this) {
        self;
      }
      if (!window.jQuery) {
        window.$ = requireModule('libraries/jquery');
        window.jQuery = window.$;
      }
      if ('undefined' == typeof jQuery) {
        throw new Error("Bootstrap's JavaScript requires jQuery");
      }
      !(function (jquery) {
        var dismissSelector = '[data-dismiss="alert"]',
          Alert = function (element) {
            jquery(element).on('click', dismissSelector, this.close);
          };
        Alert.VERSION = '3.2.0';
        Alert.prototype.close = function (event) {
          var trigger = jquery(this),
            selector = trigger.attr('data-target');
          if (!selector) {
            selector = (selector = trigger.attr('href')) && selector.replace(/.*(?=#[^\s]*$)/, '');
          }
          var alertElement = jquery(selector);
          function removeAlert() {
            alertElement.detach().trigger('closed.bs.alert').remove();
          }
          if (event) {
            event.preventDefault();
          }
          if (!alertElement.length) {
            alertElement = trigger.hasClass('alert') ? trigger : trigger.parent();
          }
          alertElement.trigger((event = jquery.Event('close.bs.alert')));
          if (!event.isDefaultPrevented()) {
            alertElement.removeClass('in');
            if (jquery.support.transition && alertElement.hasClass('fade')) {
              alertElement.one('bsTransitionEnd', removeAlert).emulateTransitionEnd(150);
            } else {
              removeAlert();
            }
          }
        };
        var previousAlert = jquery.fn.alert;
        jquery.fn.alert = function (option) {
          return this.each(function () {
            var element = jquery(this),
              instance = element.data('bs.alert');
            if (!instance) {
              element.data('bs.alert', (instance = new Alert(this)));
            }
            if ('string' == typeof option) {
              instance[option].call(element);
            }
          });
        };
        jquery.fn.alert.Constructor = Alert;
        jquery.fn.alert.noConflict = function () {
          jquery.fn.alert = previousAlert;
          return this;
        };
        jquery(document).on('click.bs.alert.data-api', dismissSelector, Alert.prototype.close);
      })(jQuery);
      (function (jquery) {
        var Button = function (element, options) {
          this.$element = jquery(element);
          this.options = jquery.extend({}, Button.DEFAULTS, options);
          this.isLoading = false;
        };
        function buttonPlugin(option) {
          return this.each(function () {
            var element = jquery(this),
              instance = element.data('bs.button'),
              options = 'object' == typeof option && option;
            if (!instance) {
              element.data('bs.button', (instance = new Button(this, options)));
            }
            if ('toggle' == option) {
              instance.toggle();
            } else {
              if (option) {
                instance.setState(option);
              }
            }
          });
        }
        Button.VERSION = '3.2.0';
        Button.DEFAULTS = { loadingText: 'loading...' };
        Button.prototype.setState = function (state) {
          var disabledClass = 'disabled',
            element = this.$element,
            contentMethod = element.is('input') ? 'val' : 'html',
            data = element.data();
          state += 'Text';
          if (null == data.resetText) {
            element.data('resetText', element[contentMethod]());
          }
          element[contentMethod](null == data[state] ? this.options[state] : data[state]);
          setTimeout(
            jquery.proxy(function () {
              if ('loadingText' == state) {
                this.isLoading = true;
                element.addClass(disabledClass).attr(disabledClass, disabledClass);
              } else {
                if (this.isLoading) {
                  this.isLoading = false;
                  element.removeClass(disabledClass).removeAttr(disabledClass);
                }
              }
            }, this),
            0,
          );
        };
        Button.prototype.toggle = function () {
          var changed = true,
            buttonGroup = this.$element.closest('[data-toggle="buttons"]');
          if (buttonGroup.length) {
            var input = this.$element.find('input');
            if ('radio' == input.prop('type')) {
              if (input.prop('checked') && this.$element.hasClass('active')) {
                changed = false;
              } else {
                buttonGroup.find('.active').removeClass('active');
              }
            }
            if (changed) {
              input.prop('checked', !this.$element.hasClass('active')).trigger('change');
            }
          }
          if (changed) {
            this.$element.toggleClass('active');
          }
        };
        var previousButton = jquery.fn.button;
        jquery.fn.button = buttonPlugin;
        jquery.fn.button.Constructor = Button;
        jquery.fn.button.noConflict = function () {
          jquery.fn.button = previousButton;
          return this;
        };
        jquery(document).on(
          'click.bs.button.data-api',
          '[data-toggle^="button"]',
          function (event) {
            var buttonElement = jquery(event.target);
            if (!buttonElement.hasClass('btn')) {
              buttonElement = buttonElement.closest('.btn');
            }
            buttonPlugin.call(buttonElement, 'toggle');
            event.preventDefault();
          },
        );
      })(jQuery);
      (function (jquery) {
        var backdropSelector = '.dropdown-backdrop',
          toggleSelector = '[data-toggle="dropdown"]',
          Dropdown = function (element) {
            jquery(element).on('click.bs.dropdown', this.toggle);
          };
        function clearMenus(event) {
          if (!(event && 3 === event.which)) {
            jquery(backdropSelector).remove();
            jquery(toggleSelector).each(function () {
              var parent = getDropdownParent(jquery(this)),
                relatedTarget = { relatedTarget: this };
              if (parent.hasClass('open')) {
                parent.trigger((event = jquery.Event('hide.bs.dropdown', relatedTarget)));
                if (!event.isDefaultPrevented()) {
                  parent.removeClass('open').trigger('hidden.bs.dropdown', relatedTarget);
                }
              }
            });
          }
        }
        function getDropdownParent(element) {
          var selector = element.attr('data-target');
          if (!selector) {
            selector =
              (selector = element.attr('href')) &&
              /#[A-Za-z]/.test(selector) &&
              selector.replace(/.*(?=#[^\s]*$)/, '');
          }
          var parent = selector && jquery(selector);
          if (parent && parent.length) {
            return parent;
          } else {
            return element.parent();
          }
        }
        Dropdown.VERSION = '3.2.0';
        Dropdown.prototype.toggle = function (event) {
          var trigger = jquery(this);
          if (!trigger.is('.disabled, :disabled')) {
            var parent = getDropdownParent(trigger),
              isOpen = parent.hasClass('open');
            clearMenus();
            if (!isOpen) {
              if (
                'ontouchstart' in document.documentElement &&
                !parent.closest('.navbar-nav').length
              ) {
                jquery('<div class="dropdown-backdrop"/>')
                  .insertAfter(jquery(this))
                  .on('click', clearMenus);
              }
              var relatedTarget = { relatedTarget: this };
              parent.trigger((event = jquery.Event('show.bs.dropdown', relatedTarget)));
              if (event.isDefaultPrevented()) {
                return;
              }
              trigger.trigger('focus');
              parent.toggleClass('open').trigger('shown.bs.dropdown', relatedTarget);
            }
            return false;
          }
        };
        Dropdown.prototype.keydown = function (event) {
          if (/(38|40|27)/.test(event.keyCode)) {
            var trigger = jquery(this);
            event.preventDefault();
            event.stopPropagation();
            if (!trigger.is('.disabled, :disabled')) {
              var parent = getDropdownParent(trigger),
                isOpen = parent.hasClass('open');
              if (!isOpen || (isOpen && 27 == event.keyCode)) {
                if (27 == event.which) {
                  parent.find(toggleSelector).trigger('focus');
                }
                return trigger.trigger('click');
              }
              var itemSelector = ' li:not(.divider):visible a',
                items = parent.find(
                  '[role="menu"]' + itemSelector + ', [role="listbox"]' + itemSelector,
                );
              if (items.length) {
                var itemIndex = items.index(items.filter(':focus'));
                if (38 == event.keyCode && itemIndex > 0) {
                  itemIndex--;
                }
                if (40 == event.keyCode && itemIndex < items.length - 1) {
                  itemIndex++;
                }
                if (!~itemIndex) {
                  itemIndex = 0;
                }
                items.eq(itemIndex).trigger('focus');
              }
            }
          }
        };
        var previousDropdown = jquery.fn.dropdown;
        jquery.fn.dropdown = function (option) {
          return this.each(function () {
            var element = jquery(this),
              instance = element.data('bs.dropdown');
            if (!instance) {
              element.data('bs.dropdown', (instance = new Dropdown(this)));
            }
            if ('string' == typeof option) {
              instance[option].call(element);
            }
          });
        };
        jquery.fn.dropdown.Constructor = Dropdown;
        jquery.fn.dropdown.noConflict = function () {
          jquery.fn.dropdown = previousDropdown;
          return this;
        };
        jquery(document)
          .on('click.bs.dropdown.data-api', 'modal.fade.in', clearMenus)
          .on('click.bs.dropdown.data-api', '.dropdown form', function (event) {
            event.stopPropagation();
          })
          .on('click.bs.dropdown.data-api', toggleSelector, Dropdown.prototype.toggle)
          .on(
            'keydown.bs.dropdown.data-api',
            toggleSelector + ', [role="menu"], [role="listbox"]',
            Dropdown.prototype.keydown,
          );
      })(jQuery);
      (function (jquery) {
        var Modal = function (element, options) {
          this.options = options;
          this.$body = jquery(document.body);
          this.$element = jquery(element);
          this.$backdrop = this.isShown = null;
          this.scrollbarWidth = 0;
          if (this.options.remote) {
            this.$element.find('.modal-content').load(
              this.options.remote,
              jquery.proxy(function () {
                this.$element.trigger('loaded.bs.modal');
              }, this),
            );
          }
        };
        function modalPlugin(option, relatedTarget) {
          return this.each(function () {
            var element = jquery(this),
              instance = element.data('bs.modal'),
              options = jquery.extend(
                {},
                Modal.DEFAULTS,
                element.data(),
                'object' == typeof option && option,
              );
            if (!instance) {
              element.data('bs.modal', (instance = new Modal(this, options)));
            }
            if ('string' == typeof option) {
              instance[option](relatedTarget);
            } else {
              if (options.show) {
                instance.show(relatedTarget);
              }
            }
          });
        }
        Modal.VERSION = '3.2.0';
        Modal.DEFAULTS = { backdrop: true, keyboard: true, show: true };
        Modal.prototype.toggle = function (relatedTarget) {
          if (this.isShown) {
            return this.hide();
          } else {
            return this.show(relatedTarget);
          }
        };
        Modal.prototype.show = function (relatedTarget) {
          var modal = this,
            showEvent = jquery.Event('show.bs.modal', { relatedTarget: relatedTarget });
          this.$element.trigger(showEvent);
          if (!(this.isShown || showEvent.isDefaultPrevented())) {
            this.isShown = true;
            this.checkScrollbar();
            this.$body.addClass('modal-open');
            this.setScrollbar();
            this.escape();
            this.$element.on(
              'click.dismiss.bs.modal',
              '[data-dismiss="modal"]',
              jquery.proxy(this.hide, this),
            );
            this.backdrop(function () {
              var transition = jquery.support.transition && modal.$element.hasClass('fade');
              if (!modal.$element.parent().length) {
                modal.$element.appendTo(modal.$body);
              }
              modal.$element.show().scrollTop(0);
              if (transition) {
                modal.$element[0].offsetWidth;
              }
              modal.$element.addClass('in').attr('aria-hidden', false);
              modal.enforceFocus();
              var shownEvent = jquery.Event('shown.bs.modal', { relatedTarget: relatedTarget });
              if (transition) {
                modal.$element
                  .find('.modal-dialog')
                  .one('bsTransitionEnd', function () {
                    modal.$element.trigger('focus').trigger(shownEvent);
                  })
                  .emulateTransitionEnd(300);
              } else {
                modal.$element.trigger('focus').trigger(shownEvent);
              }
            });
          }
        };
        Modal.prototype.hide = function (event) {
          if (event) {
            event.preventDefault();
          }
          event = jquery.Event('hide.bs.modal');
          this.$element.trigger(event);
          if (this.isShown && !event.isDefaultPrevented()) {
            this.isShown = false;
            this.resetScrollbar();
            this.escape();
            jquery(document).off('focusin.bs.modal');
            this.$element.removeClass('in').attr('aria-hidden', true).off('click.dismiss.bs.modal');
            if (jquery.support.transition && this.$element.hasClass('fade')) {
              this.$element
                .one('bsTransitionEnd', jquery.proxy(this.hideModal, this))
                .emulateTransitionEnd(300);
            } else {
              this.hideModal();
            }
          }
        };
        Modal.prototype.enforceFocus = function () {
          jquery(document)
            .off('focusin.bs.modal')
            .on(
              'focusin.bs.modal',
              jquery.proxy(function (event) {
                if (
                  !(this.$element[0] === event.target || this.$element.has(event.target).length)
                ) {
                  this.$element.trigger('focus');
                }
              }, this),
            );
        };
        Modal.prototype.escape = function () {
          if (this.isShown && this.options.keyboard) {
            this.$element.on(
              'keyup.dismiss.bs.modal',
              jquery.proxy(function (event) {
                if (27 == event.which) {
                  this.hide();
                }
              }, this),
            );
          } else {
            if (!this.isShown) {
              this.$element.off('keyup.dismiss.bs.modal');
            }
          }
        };
        Modal.prototype.hideModal = function () {
          var modal = this;
          this.$element.hide();
          this.backdrop(function () {
            modal.$element.trigger('hidden.bs.modal');
            jquery('body').removeClass('modal-open');
          });
        };
        Modal.prototype.removeBackdrop = function () {
          if (this.$backdrop) {
            this.$backdrop.remove();
          }
          this.$backdrop = null;
        };
        Modal.prototype.backdrop = function (callback) {
          var modal = this,
            animationClass = this.$element.hasClass('fade') ? 'fade' : '';
          if (this.isShown && this.options.backdrop) {
            var transition = jquery.support.transition && animationClass;
            this.$backdrop = jquery(
              '<div class="modal-backdrop ' + animationClass + '" />',
            ).appendTo(this.$body);
            this.$element.on(
              'click.dismiss.bs.modal',
              jquery.proxy(function (event) {
                if (event.target === event.currentTarget) {
                  if ('static' == this.options.backdrop) {
                    this.$element[0].focus.call(this.$element[0]);
                  } else {
                    this.hide.call(this);
                  }
                }
              }, this),
            );
            if (transition) {
              this.$backdrop[0].offsetWidth;
            }
            this.$backdrop.addClass('in');
            if (!callback) {
              return;
            }
            if (transition) {
              this.$backdrop.one('bsTransitionEnd', callback).emulateTransitionEnd(150);
            } else {
              callback();
            }
          } else {
            if (!this.isShown && this.$backdrop) {
              this.$backdrop.removeClass('in');
              var removeBackdrop = function () {
                modal.removeBackdrop();
                if (callback) {
                  callback();
                }
              };
              if (jquery.support.transition && this.$element.hasClass('fade')) {
                this.$backdrop.one('bsTransitionEnd', removeBackdrop).emulateTransitionEnd(150);
              } else {
                removeBackdrop();
              }
            } else {
              if (callback) {
                callback();
              }
            }
          }
        };
        Modal.prototype.checkScrollbar = function () {
          if (!(document.body.clientWidth >= window.innerWidth)) {
            this.scrollbarWidth = this.scrollbarWidth || this.measureScrollbar();
          }
        };
        Modal.prototype.setScrollbar = function () {
          var bodyPadding = parseInt(this.$body.css('padding-right') || 0, 10);
          if (this.scrollbarWidth) {
            this.$body.css('padding-right', bodyPadding + this.scrollbarWidth);
          }
        };
        Modal.prototype.resetScrollbar = function () {
          this.$body.css('padding-right', '');
        };
        Modal.prototype.measureScrollbar = function () {
          var scrollbarMeasure = document.createElement('div');
          scrollbarMeasure.className = 'modal-scrollbar-measure';
          this.$body.append(scrollbarMeasure);
          var scrollbarWidth = scrollbarMeasure.offsetWidth - scrollbarMeasure.clientWidth;
          this.$body[0].removeChild(scrollbarMeasure);
          return scrollbarWidth;
        };
        var previousModal = jquery.fn.modal;
        jquery.fn.modal = modalPlugin;
        jquery.fn.modal.Constructor = Modal;
        jquery.fn.modal.noConflict = function () {
          jquery.fn.modal = previousModal;
          return this;
        };
        jquery(document).on('click.bs.modal.data-api', '[data-toggle="modal"]', function (event) {
          var trigger = jquery(this),
            href = trigger.attr('href'),
            target = jquery(
              trigger.attr('data-target') || (href && href.replace(/.*(?=#[^\s]+$)/, '')),
            ),
            option = target.data('bs.modal')
              ? 'toggle'
              : jquery.extend({ remote: !/#/.test(href) && href }, target.data(), trigger.data());
          if (trigger.is('a')) {
            event.preventDefault();
          }
          target.one('show.bs.modal', function (event) {
            if (!event.isDefaultPrevented()) {
              target.one('hidden.bs.modal', function () {
                if (trigger.is(':visible')) {
                  trigger.trigger('focus');
                }
              });
            }
          });
          modalPlugin.call(target, option, this);
        });
      })(jQuery);
      (function (jquery) {
        var Tab = function (element) {
          this.element = jquery(element);
        };
        function tabPlugin(option) {
          return this.each(function () {
            var element = jquery(this),
              instance = element.data('bs.tab');
            if (!instance) {
              element.data('bs.tab', (instance = new Tab(this)));
            }
            if ('string' == typeof option) {
              instance[option]();
            }
          });
        }
        Tab.VERSION = '3.2.0';
        Tab.prototype.show = function () {
          var element = this.element,
            list = element.closest('ul:not(.dropdown-menu)'),
            selector = element.data('target');
          if (!selector) {
            selector = (selector = element.attr('href')) && selector.replace(/.*(?=#[^\s]*$)/, '');
          }
          if (!element.parent('li').hasClass('active')) {
            var previousTab = list.find('.active:last a')[0],
              showEvent = jquery.Event('show.bs.tab', { relatedTarget: previousTab });
            element.trigger(showEvent);
            if (!showEvent.isDefaultPrevented()) {
              var target = jquery(selector);
              this.activate(element.closest('li'), list);
              this.activate(target, target.parent(), function () {
                element.trigger({ type: 'shown.bs.tab', relatedTarget: previousTab });
              });
            }
          }
        };
        Tab.prototype.activate = function (element, container, callback) {
          var activeElement = container.find('> .active'),
            transition = callback && jquery.support.transition && activeElement.hasClass('fade');
          function activateTab() {
            activeElement
              .removeClass('active')
              .find('> .dropdown-menu > .active')
              .removeClass('active');
            element.addClass('active');
            if (transition) {
              element[0].offsetWidth;
              element.addClass('in');
            } else {
              element.removeClass('fade');
            }
            if (element.parent('.dropdown-menu')) {
              element.closest('li.dropdown').addClass('active');
            }
            if (callback) {
              callback();
            }
          }
          if (transition) {
            activeElement.one('bsTransitionEnd', activateTab).emulateTransitionEnd(150);
          } else {
            activateTab();
          }
          activeElement.removeClass('in');
        };
        var previousTabPlugin = jquery.fn.tab;
        jquery.fn.tab = tabPlugin;
        jquery.fn.tab.Constructor = Tab;
        jquery.fn.tab.noConflict = function () {
          jquery.fn.tab = previousTabPlugin;
          return this;
        };
        jquery(document).on(
          'click.bs.tab.data-api',
          '[data-toggle="tab"], [data-toggle="pill"]',
          function (event) {
            event.preventDefault();
            tabPlugin.call(jquery(this), 'show');
          },
        );
      })(jQuery);
    },
  );
}
