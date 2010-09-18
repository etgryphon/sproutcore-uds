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
  /**
   * Initializes the adapter with the given options (hash).
   */
  init: function(options) {
    this.storage = this.merge(window.localStorage, options.storage);
    this.table = this.merge('field', options.table);

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
  },
  
  _deserializeHash: function(){
    var key = this.table, results;
    try {
      results = this.deserialize(this.storage.getItem(key)) || {};
    } catch(e) {
      console.warn('Error during deserialization of records; clearing the cache.');
      this.nuke();
      results = {};
    }
    return results;
  },
  
  _serializeHash: function(data){
    var key = this.table;
    return this.storage.setItem(key, this.serialize(data));
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
    var data = this._deserializeHash();
    data[key] = obj;
    this._serializeHash(data);
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
    var data = this._deserializeHash();
    var keys = obj.key, length = obj.key.length;
    var records = obj.records || obj.record;
    
    for (var i = 0; i < length; i++) {      
      data[keys[i]] = records[i];
    }

    this._serializeHash(data);
    
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
    var data = this._deserializeHash();
    var rec = data[id];

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
    var results = [], data = this._deserializeHash();
    
    for(var i in data){
      if(data.hasOwnProperty(i)){
        results.push(data[i]);
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
    var data = this._deserializeHash();
    delete data[id];
    
    this._serializeHash(data);
    // Invoke the callback.
    if (callback) callback();
  },

  /**
   * Removes all data associated with this table from the local storage.
   *
   * @param {Function} callback The optional callback to invoke on completion.
   */
  nuke: function(callback) {
    this.storage.removeItem(this.table);

    // Invoke the callback.
    if (callback) callback();
  }
};

