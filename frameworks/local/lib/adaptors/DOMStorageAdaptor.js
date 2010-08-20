/*globals LawnchairAdaptorHelpers*/
/**
 * DOMStorageAdaptor
 *
 * DOM Storage implementation for Lawnchair.
 *
 * Originally authored by Joseph Pecoraro.
 *
 * window.name code courtesy Remy Sharp:
 *  http://24ways.org/2009/breaking-out-the-edges-of-the-browser
 *
 * Significant portions rewritten by Sean Eidemiller (sean@halcyon.cc) to increase performance in
 * slower browsers (including Firefox 3.x and 4.0 betas).
 */
var DOMStorageAdaptor = function(options) {
  for (var i in LawnchairAdaptorHelpers) {
    this[i] = LawnchairAdaptorHelpers[i];
  }

  this.init(options);
};

DOMStorageAdaptor.prototype = {

  init: function(options) {
    var self = this;
    this.storage = this.merge(window.localStorage, options.storage);
    this.table = this.merge('field', options.table);
    
    if (!(this.storage instanceof window.Storage)) {
      this.storage = (function () {
        // window.top.name ensures top level, and supports around 2Mb
        var data = window.top.name ? self.deserialize(window.top.name) : {};
        return {
          setItem: function (key, value) {
            data[key] = value + "";
            window.top.name = self.serialize(data);
          },
          removeItem: function (key) {
            delete data[key];
            window.top.name = self.serialize(data);
          },
          getItem: function (key) {
            return data[key] || null;
          },
          clear: function () {
            data = {};
            window.top.name = '';
          }
        };
      })();
    }
  },

  save: function(obj, callback) {
    var id = this.table + ':' + (obj.key || this.uuid());
    var key = obj.key;
    this.storage.setItem(id, this.serialize(obj));
    if (callback) {
      obj.key = key;
      callback(obj);
    }
  },

  get: function(key, callback) {
    var obj = this.deserialize(this.storage.getItem(this.table + ':' + key));
    if (obj) {
      obj.key = key;
      if (callback) callback(obj);
    } else {
      if (callback) callback(null);
    }
  },

  all: function(callback) {
    var cb = this.terseToVerboseCallback(callback);
    var results = [];
    var table = this.table;
    var id, idTokens, obj, item;

    for (var i = 0, len = this.storage.length; i < len; ++i) {
      id = this.storage.key(i);

      // Do a cheap short-circuit if possible.
      if (id.charAt(0) !== table.charAt(0)) continue;

      idTokens = id.split(':');

      if (this.table === idTokens[0]) {
        item = this.storage.getItem(id); 
        obj = this.deserialize(item);
        obj.key = idTokens[1];
        results.push(obj);
      }
    }

    if (cb) cb(results);
  },

  remove: function(id, callback) {
    var key = this.table + ':' + id;
    this.storage.removeItem(key);
    if (callback) callback();
  },

  nuke: function(callback) {
    var self = this;
    this.all(function(r) {
      for (var i = 0, l = r.length; i < l; i++) {
        self.remove(r[i]);
      }

      if (callback) callback();
    });
  }
};

