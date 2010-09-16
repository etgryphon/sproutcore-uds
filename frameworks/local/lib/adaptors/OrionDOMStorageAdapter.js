/*globals LawnchairAdaptorHelpers*/
/**
 * OrionDOMStorageAdapter
 *
 * DOM Storage implementation for Lawnchair (specific to Orion).
 *
 * Originally authored by Joseph Pecoraro.
 *
 * window.name code courtesy Remy Sharp:
 *  http://24ways.org/2009/breaking-out-the-edges-of-the-browser
 *
 * Significant portions rewritten by Sean Eidemiller (sean@halcyon.cc) and Mike Ball
 * (mike.ball@eloqua.com) to improve performance on slower browsers (including Firefox 3.x and 4.0
 * betas).
 */
var OrionDOMStorageAdapter = function(options) {
  for (var i in LawnchairAdaptorHelpers) {
    if (LawnchairAdaptorHelpers.hasOwnProperty(i)) {
      this[i] = LawnchairAdaptorHelpers[i];
    }
  }

  this.init(options);
};

OrionDOMStorageAdapter.prototype = {

  supportsChunkedLoads: YES,
  _indexArrayName: null,
  _indexArray: null,
  _keyPrefix: null,

  /**
   * Initializes the adapter with the given options (hash).
   */
  init: function(options) {
    this.storage = this.merge(window.localStorage, options.storage);
    this.table = this.merge('field', options.table);
    this._keyPrefix = this.table + ':';

    // Fallback for the stupider browsers/versions.
    if (!(this.storage instanceof window.Storage)) {
      var self = this;
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

    // Initialize the index table.
    this._indexArrayName = this._keyPrefix + 'index';

    try {
      this._indexArray = this.deserialize(this.storage.getItem(this._indexArrayName)) || [];
    } catch(e) {
      // Error during deserialization; nuke the cache.
      console.warn('Error during deserialization of index; clearing the cache.');
      this.nukeWithoutIndex();
    }
  },

  /**
   * Writes a single record or an array of records to the local storage.
   *
   * @param {Object} obj The object containing the record to write.
   *    Should be of the form { key: <id>, record: <record> }
   * @param {Function} callback The optional callback to invoke on completion.
   */
  save: function(obj, callback) {
    var key = obj.key;

    if (key instanceof Array) {
      // Got an array of objects.
      this._saveAll(obj, callback);
      return;
    }

    // Store the ID of the record in the index array.
    var index = this._indexArray;
    var id = this._keyPrefix + (key || this.uuid());
    var currIndex = index.indexOf(id);

    if (currIndex <= 0) {
      index.push(id);
      this.storage.setItem(this._indexArrayName, this.serialize(index));
    }

    // Store the record itself.
    this.storage.setItem(id, this.serialize(obj.record));

    // Invoke the callback.
    if (callback) callback(obj);
  },

  /**
   * Writes multiple records to the local storage.
   *
   * @param {Object} obj The object containing the records to write.
   *    Should be of the form { key: [<ids>], records: [<records>] }
   *    May also include startIndex and count parameters (both Numbers) for chunked loading.
   * @param {Function} callback The optional callback to invoke on completion.
   */
  _saveAll: function(obj, callback) {
    var table = this.table;
    var ids = obj.key;
    var records = obj.records || obj.record;
    var startAt = obj.startIndex || 0;
    var count = obj.count;
    var len = ids.length;
    var endAt = count ? (len - startAt > count ? startAt + count : len) : len;
    var index = this._indexArray;
    var currIndex, id;

    for (var i = startAt; i < endAt; i++) {
      // Store the ID of the record in the index array.
      id = this._keyPrefix + ids[i];
      currIndex = index.indexOf(id);
      if (currIndex < 0) index.push(id);

      // Store the record itself.
      this.storage.setItem(id, this.serialize(records[i]));
    }

    // Reserialize the index array.
    this.storage.setItem(this._indexArrayName, this.serialize(index));

    // Invoke the callback.
    if (callback) callback();
  },

  /**
   * Reads a single record from the local storage.
   *
   * @param {String} id The ID of the record.
   * @param {Function} callback The optional callback to invoke on completion.
   */
  get: function(id, callback) {
    var rec = null;

    try {
      rec = this.deserialize(this.storage.getItem(this._keyPrefix + id));
    } catch(e) {
      console.warn('Error during deserialization; removing item from cache.');
      this.remove(id);
    }

    if (rec) {
      rec.key = id;
      if (callback) callback(obj);
    } else {
      if (callback) callback(null);
    }
  },

  /**
   * Reads all of the records in this table from the local storage.
   *
   * @param {Function} callback The optional callback to invoke on completion.
   */
  all: function(callback) {
    var cb = this.terseToVerboseCallback(callback);
    var results = [];
    var table = this.table;
    var id, rec;

    // Get the index for the table and iterate over them.
    var index = this._indexArray;

    for (var i = 0, len = index.length; i < len; ++i) {
      id = index[i];
      rec = this.storage.getItem(id);
      // Push the record (as a string) onto the results array.
      if (rec) results.push(rec);
    }

    // Concatenate the entire results array and deserialize.
    if (results.length > 0) {
      var allRecords = results.join(',');
      try {
        results = this.deserialize('[' + allRecords + ']');
      } catch(e) {
        console.warn('Error during deserialization of records; clearing the cache.');
        this.nuke();
        results = null;
      }
    }

    // Invoke the callback.
    if (cb) cb(results);
  },

  /**
   * Removes a single record from the local storage.
   *
   * @param {String} id The ID of the record.
   * @param {Function} callback The optional callback to invoke on completion.
   */
  remove: function(id, callback) {
    // Remove the record.
    var key = this._keyPrefix + id;
    this.storage.removeItem(key);

    // Remove the ID from the index array.
    var index = this._indexArray;
    var currIndex = index.indexOf(key);
    if (currIndex >= 0) {
      index.pop(currIndex);
      this.storage.setItem(this._indexArrayName, this.serialize(index));  
    }

    // Invoke the callback.
    if (callback) callback();
  },

  /**
   * Removes all data associated with this table from the local storage.
   *
   * @param {Function} callback The optional callback to invoke on completion.
   */
  nuke: function(callback) {
    var index = this._indexArray;

    // Remove all records.
    for (var i = 0, len = index.length; i < len; ++i) {
      this.storage.removeItem(index[i]);
    }

    // Clear the index array.
    this._indexArray = [];
    this.storage.setItem(this._indexArrayName, this.serialize(this._indexArray));

    // Invoke the callback.
    if (callback) callback();
  },

  /**
   * Removes all data associated with this table from the local storage WITHOUT using the index
   * array (useful if the index array is corrupt).
   */
  nukeWithoutIndex: function() {
    var table = this.table;
    var id;

    // Iterate through the entirety of the local storage.
    for (var i = 0, len = this.storage.length; i < len; ++i) {
      id = this.storage.key(i);

      // Do a cheap short-circuit if possible.
      if (id.charAt(0) !== table.charAt(0)) continue;

      // If the record matches the record type of the table, remove it.
      if (this.table === id.split(':')[0]) this.storage.removeItem(id); 
    }

    // Clear the index table.
    this._indexArray = [];
    this.storage.setItem(this._indexArrayName, this.serialize(this._indexArray));
  }
};

