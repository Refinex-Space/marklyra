// libraries/bootstrap-widgets.
// SystemJS module f. Dependencies: e.
$__System.registerDynamic('f', ['e'], !0, function (e, t, n) {
  'use strict';
  this || self;
  if (
    (window.jQuery || ((window.$ = e('e')), (window.jQuery = window.$)),
    'undefined' == typeof jQuery)
  )
    throw new Error("Bootstrap's JavaScript requires jQuery");
  !(function (e) {
    var t = '[data-dismiss="alert"]',
      n = function (n) {
        e(n).on('click', t, this.close);
      };
    (n.VERSION = '3.2.0'),
      (n.prototype.close = function (t) {
        var n = e(this),
          i = n.attr('data-target');
        i || (i = (i = n.attr('href')) && i.replace(/.*(?=#[^\s]*$)/, ''));
        var r = e(i);
        function o() {
          r.detach().trigger('closed.bs.alert').remove();
        }
        t && t.preventDefault(),
          r.length || (r = n.hasClass('alert') ? n : n.parent()),
          r.trigger((t = e.Event('close.bs.alert'))),
          t.isDefaultPrevented() ||
            (r.removeClass('in'),
            e.support.transition && r.hasClass('fade')
              ? r.one('bsTransitionEnd', o).emulateTransitionEnd(150)
              : o());
      });
    var i = e.fn.alert;
    (e.fn.alert = function (t) {
      return this.each(function () {
        var i = e(this),
          r = i.data('bs.alert');
        r || i.data('bs.alert', (r = new n(this))), 'string' == typeof t && r[t].call(i);
      });
    }),
      (e.fn.alert.Constructor = n),
      (e.fn.alert.noConflict = function () {
        return (e.fn.alert = i), this;
      }),
      e(document).on('click.bs.alert.data-api', t, n.prototype.close);
  })(jQuery),
    (function (e) {
      var t = function (n, i) {
        (this.$element = e(n)), (this.options = e.extend({}, t.DEFAULTS, i)), (this.isLoading = !1);
      };
      function n(n) {
        return this.each(function () {
          var i = e(this),
            r = i.data('bs.button'),
            o = 'object' == typeof n && n;
          r || i.data('bs.button', (r = new t(this, o))),
            'toggle' == n ? r.toggle() : n && r.setState(n);
        });
      }
      (t.VERSION = '3.2.0'),
        (t.DEFAULTS = { loadingText: 'loading...' }),
        (t.prototype.setState = function (t) {
          var n = 'disabled',
            i = this.$element,
            r = i.is('input') ? 'val' : 'html',
            o = i.data();
          (t += 'Text'),
            null == o.resetText && i.data('resetText', i[r]()),
            i[r](null == o[t] ? this.options[t] : o[t]),
            setTimeout(
              e.proxy(function () {
                'loadingText' == t
                  ? ((this.isLoading = !0), i.addClass(n).attr(n, n))
                  : this.isLoading && ((this.isLoading = !1), i.removeClass(n).removeAttr(n));
              }, this),
              0,
            );
        }),
        (t.prototype.toggle = function () {
          var e = !0,
            t = this.$element.closest('[data-toggle="buttons"]');
          if (t.length) {
            var n = this.$element.find('input');
            'radio' == n.prop('type') &&
              (n.prop('checked') && this.$element.hasClass('active')
                ? (e = !1)
                : t.find('.active').removeClass('active')),
              e && n.prop('checked', !this.$element.hasClass('active')).trigger('change');
          }
          e && this.$element.toggleClass('active');
        });
      var i = e.fn.button;
      (e.fn.button = n),
        (e.fn.button.Constructor = t),
        (e.fn.button.noConflict = function () {
          return (e.fn.button = i), this;
        }),
        e(document).on('click.bs.button.data-api', '[data-toggle^="button"]', function (t) {
          var i = e(t.target);
          i.hasClass('btn') || (i = i.closest('.btn')), n.call(i, 'toggle'), t.preventDefault();
        });
    })(jQuery),
    (function (e) {
      var t = '.dropdown-backdrop',
        n = '[data-toggle="dropdown"]',
        i = function (t) {
          e(t).on('click.bs.dropdown', this.toggle);
        };
      function r(i) {
        (i && 3 === i.which) ||
          (e(t).remove(),
          e(n).each(function () {
            var t = o(e(this)),
              n = { relatedTarget: this };
            t.hasClass('open') &&
              (t.trigger((i = e.Event('hide.bs.dropdown', n))),
              i.isDefaultPrevented() || t.removeClass('open').trigger('hidden.bs.dropdown', n));
          }));
      }
      function o(t) {
        var n = t.attr('data-target');
        n || (n = (n = t.attr('href')) && /#[A-Za-z]/.test(n) && n.replace(/.*(?=#[^\s]*$)/, ''));
        var i = n && e(n);
        return i && i.length ? i : t.parent();
      }
      (i.VERSION = '3.2.0'),
        (i.prototype.toggle = function (t) {
          var n = e(this);
          if (!n.is('.disabled, :disabled')) {
            var i = o(n),
              a = i.hasClass('open');
            if ((r(), !a)) {
              'ontouchstart' in document.documentElement &&
                !i.closest('.navbar-nav').length &&
                e('<div class="dropdown-backdrop"/>').insertAfter(e(this)).on('click', r);
              var s = { relatedTarget: this };
              if ((i.trigger((t = e.Event('show.bs.dropdown', s))), t.isDefaultPrevented())) return;
              n.trigger('focus'), i.toggleClass('open').trigger('shown.bs.dropdown', s);
            }
            return !1;
          }
        }),
        (i.prototype.keydown = function (t) {
          if (/(38|40|27)/.test(t.keyCode)) {
            var i = e(this);
            if ((t.preventDefault(), t.stopPropagation(), !i.is('.disabled, :disabled'))) {
              var r = o(i),
                a = r.hasClass('open');
              if (!a || (a && 27 == t.keyCode))
                return 27 == t.which && r.find(n).trigger('focus'), i.trigger('click');
              var s = ' li:not(.divider):visible a',
                l = r.find('[role="menu"]' + s + ', [role="listbox"]' + s);
              if (l.length) {
                var c = l.index(l.filter(':focus'));
                38 == t.keyCode && c > 0 && c--,
                  40 == t.keyCode && c < l.length - 1 && c++,
                  ~c || (c = 0),
                  l.eq(c).trigger('focus');
              }
            }
          }
        });
      var a = e.fn.dropdown;
      (e.fn.dropdown = function (t) {
        return this.each(function () {
          var n = e(this),
            r = n.data('bs.dropdown');
          r || n.data('bs.dropdown', (r = new i(this))), 'string' == typeof t && r[t].call(n);
        });
      }),
        (e.fn.dropdown.Constructor = i),
        (e.fn.dropdown.noConflict = function () {
          return (e.fn.dropdown = a), this;
        }),
        e(document)
          .on('click.bs.dropdown.data-api', 'modal.fade.in', r)
          .on('click.bs.dropdown.data-api', '.dropdown form', function (e) {
            e.stopPropagation();
          })
          .on('click.bs.dropdown.data-api', n, i.prototype.toggle)
          .on(
            'keydown.bs.dropdown.data-api',
            n + ', [role="menu"], [role="listbox"]',
            i.prototype.keydown,
          );
    })(jQuery),
    (function (e) {
      var t = function (t, n) {
        (this.options = n),
          (this.$body = e(document.body)),
          (this.$element = e(t)),
          (this.$backdrop = this.isShown = null),
          (this.scrollbarWidth = 0),
          this.options.remote &&
            this.$element.find('.modal-content').load(
              this.options.remote,
              e.proxy(function () {
                this.$element.trigger('loaded.bs.modal');
              }, this),
            );
      };
      function n(n, i) {
        return this.each(function () {
          var r = e(this),
            o = r.data('bs.modal'),
            a = e.extend({}, t.DEFAULTS, r.data(), 'object' == typeof n && n);
          o || r.data('bs.modal', (o = new t(this, a))),
            'string' == typeof n ? o[n](i) : a.show && o.show(i);
        });
      }
      (t.VERSION = '3.2.0'),
        (t.DEFAULTS = { backdrop: !0, keyboard: !0, show: !0 }),
        (t.prototype.toggle = function (e) {
          return this.isShown ? this.hide() : this.show(e);
        }),
        (t.prototype.show = function (t) {
          var n = this,
            i = e.Event('show.bs.modal', { relatedTarget: t });
          this.$element.trigger(i),
            this.isShown ||
              i.isDefaultPrevented() ||
              ((this.isShown = !0),
              this.checkScrollbar(),
              this.$body.addClass('modal-open'),
              this.setScrollbar(),
              this.escape(),
              this.$element.on(
                'click.dismiss.bs.modal',
                '[data-dismiss="modal"]',
                e.proxy(this.hide, this),
              ),
              this.backdrop(function () {
                var i = e.support.transition && n.$element.hasClass('fade');
                n.$element.parent().length || n.$element.appendTo(n.$body),
                  n.$element.show().scrollTop(0),
                  i && n.$element[0].offsetWidth,
                  n.$element.addClass('in').attr('aria-hidden', !1),
                  n.enforceFocus();
                var r = e.Event('shown.bs.modal', { relatedTarget: t });
                i
                  ? n.$element
                      .find('.modal-dialog')
                      .one('bsTransitionEnd', function () {
                        n.$element.trigger('focus').trigger(r);
                      })
                      .emulateTransitionEnd(300)
                  : n.$element.trigger('focus').trigger(r);
              }));
        }),
        (t.prototype.hide = function (t) {
          t && t.preventDefault(),
            (t = e.Event('hide.bs.modal')),
            this.$element.trigger(t),
            this.isShown &&
              !t.isDefaultPrevented() &&
              ((this.isShown = !1),
              this.resetScrollbar(),
              this.escape(),
              e(document).off('focusin.bs.modal'),
              this.$element.removeClass('in').attr('aria-hidden', !0).off('click.dismiss.bs.modal'),
              e.support.transition && this.$element.hasClass('fade')
                ? this.$element
                    .one('bsTransitionEnd', e.proxy(this.hideModal, this))
                    .emulateTransitionEnd(300)
                : this.hideModal());
        }),
        (t.prototype.enforceFocus = function () {
          e(document)
            .off('focusin.bs.modal')
            .on(
              'focusin.bs.modal',
              e.proxy(function (e) {
                this.$element[0] === e.target ||
                  this.$element.has(e.target).length ||
                  this.$element.trigger('focus');
              }, this),
            );
        }),
        (t.prototype.escape = function () {
          this.isShown && this.options.keyboard
            ? this.$element.on(
                'keyup.dismiss.bs.modal',
                e.proxy(function (e) {
                  27 == e.which && this.hide();
                }, this),
              )
            : this.isShown || this.$element.off('keyup.dismiss.bs.modal');
        }),
        (t.prototype.hideModal = function () {
          var t = this;
          this.$element.hide(),
            this.backdrop(function () {
              t.$element.trigger('hidden.bs.modal'), e('body').removeClass('modal-open');
            });
        }),
        (t.prototype.removeBackdrop = function () {
          this.$backdrop && this.$backdrop.remove(), (this.$backdrop = null);
        }),
        (t.prototype.backdrop = function (t) {
          var n = this,
            i = this.$element.hasClass('fade') ? 'fade' : '';
          if (this.isShown && this.options.backdrop) {
            var r = e.support.transition && i;
            if (
              ((this.$backdrop = e('<div class="modal-backdrop ' + i + '" />').appendTo(
                this.$body,
              )),
              this.$element.on(
                'click.dismiss.bs.modal',
                e.proxy(function (e) {
                  e.target === e.currentTarget &&
                    ('static' == this.options.backdrop
                      ? this.$element[0].focus.call(this.$element[0])
                      : this.hide.call(this));
                }, this),
              ),
              r && this.$backdrop[0].offsetWidth,
              this.$backdrop.addClass('in'),
              !t)
            )
              return;
            r ? this.$backdrop.one('bsTransitionEnd', t).emulateTransitionEnd(150) : t();
          } else if (!this.isShown && this.$backdrop) {
            this.$backdrop.removeClass('in');
            var o = function () {
              n.removeBackdrop(), t && t();
            };
            e.support.transition && this.$element.hasClass('fade')
              ? this.$backdrop.one('bsTransitionEnd', o).emulateTransitionEnd(150)
              : o();
          } else t && t();
        }),
        (t.prototype.checkScrollbar = function () {
          document.body.clientWidth >= window.innerWidth ||
            (this.scrollbarWidth = this.scrollbarWidth || this.measureScrollbar());
        }),
        (t.prototype.setScrollbar = function () {
          var e = parseInt(this.$body.css('padding-right') || 0, 10);
          this.scrollbarWidth && this.$body.css('padding-right', e + this.scrollbarWidth);
        }),
        (t.prototype.resetScrollbar = function () {
          this.$body.css('padding-right', '');
        }),
        (t.prototype.measureScrollbar = function () {
          var e = document.createElement('div');
          (e.className = 'modal-scrollbar-measure'), this.$body.append(e);
          var t = e.offsetWidth - e.clientWidth;
          return this.$body[0].removeChild(e), t;
        });
      var i = e.fn.modal;
      (e.fn.modal = n),
        (e.fn.modal.Constructor = t),
        (e.fn.modal.noConflict = function () {
          return (e.fn.modal = i), this;
        }),
        e(document).on('click.bs.modal.data-api', '[data-toggle="modal"]', function (t) {
          var i = e(this),
            r = i.attr('href'),
            o = e(i.attr('data-target') || (r && r.replace(/.*(?=#[^\s]+$)/, ''))),
            a = o.data('bs.modal')
              ? 'toggle'
              : e.extend({ remote: !/#/.test(r) && r }, o.data(), i.data());
          i.is('a') && t.preventDefault(),
            o.one('show.bs.modal', function (e) {
              e.isDefaultPrevented() ||
                o.one('hidden.bs.modal', function () {
                  i.is(':visible') && i.trigger('focus');
                });
            }),
            n.call(o, a, this);
        });
    })(jQuery),
    (function (e) {
      var t = function (t) {
        this.element = e(t);
      };
      function n(n) {
        return this.each(function () {
          var i = e(this),
            r = i.data('bs.tab');
          r || i.data('bs.tab', (r = new t(this))), 'string' == typeof n && r[n]();
        });
      }
      (t.VERSION = '3.2.0'),
        (t.prototype.show = function () {
          var t = this.element,
            n = t.closest('ul:not(.dropdown-menu)'),
            i = t.data('target');
          if (
            (i || (i = (i = t.attr('href')) && i.replace(/.*(?=#[^\s]*$)/, '')),
            !t.parent('li').hasClass('active'))
          ) {
            var r = n.find('.active:last a')[0],
              o = e.Event('show.bs.tab', { relatedTarget: r });
            if ((t.trigger(o), !o.isDefaultPrevented())) {
              var a = e(i);
              this.activate(t.closest('li'), n),
                this.activate(a, a.parent(), function () {
                  t.trigger({ type: 'shown.bs.tab', relatedTarget: r });
                });
            }
          }
        }),
        (t.prototype.activate = function (t, n, i) {
          var r = n.find('> .active'),
            o = i && e.support.transition && r.hasClass('fade');
          function a() {
            r.removeClass('active').find('> .dropdown-menu > .active').removeClass('active'),
              t.addClass('active'),
              o ? (t[0].offsetWidth, t.addClass('in')) : t.removeClass('fade'),
              t.parent('.dropdown-menu') && t.closest('li.dropdown').addClass('active'),
              i && i();
          }
          o ? r.one('bsTransitionEnd', a).emulateTransitionEnd(150) : a(), r.removeClass('in');
        });
      var i = e.fn.tab;
      (e.fn.tab = n),
        (e.fn.tab.Constructor = t),
        (e.fn.tab.noConflict = function () {
          return (e.fn.tab = i), this;
        }),
        e(document).on(
          'click.bs.tab.data-api',
          '[data-toggle="tab"], [data-toggle="pill"]',
          function (t) {
            t.preventDefault(), n.call(e(this), 'show');
          },
        );
    })(jQuery);
});
