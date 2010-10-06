/* globals SCUDS */

sc_require('storage/adapter');

/**
 * Storage adapter for DOM storage. 
 *
 * @extends SCUDS.LocalStorageAdapter
 * @author Mike Ball
 * @author Sean Eidemiller
 *
 * @version 0.1
 */
SCUDS.DOMStorageAdapter = SCUDS.LocalStorageAdapter.extend(
  /** @scope SCUDS.DOMStorageAdapter.prototype */ {
 
  localStorageKey: 'SCUDS',
  contentItemKey: 'id',
  maxBufferSize: 100,

  init: function() {
    sc_super();

    // Check to see if there's anything in the buffer and populate the in-memory hash.
    var key = this.localStorageKey;
    this._bufferKey = SC.empty(key) ? 'buffer' : '%@:buffer'.fmt(key);
    this._buffer = this._deserializeHash(this._bufferKey) || {};
  },

  _deserializeHash: function(key) {
    var results;

    if (SC.empty(key)) key = this.localStorageKey;

    try {
      results = SC.json.decode(window.localStorage.getItem(key)) || null;
    } catch(e) {
      SC.Logger.warn('Error during deserialization of records; clearing the cache.');
      this.nuke();
      results = null;
    }

    return results;
  },

  _deserializeAsArray: function(key) {
    var results;

    if (SC.empty(key)) key = this.localStorageKey;

    try {
      var data = window.localStorage.getItem(key) || '';
      data = data.replace(/\"[0-9]+\":/gi, '');
      results = SC.json.decode('[' + data.substring(1, data.length - 1) + ']') || [];
    } catch(e) {
      SC.Logger.warn('Error during deserialization of records; clearing the cache.');
      this.nuke();
      results = [];
    }

    // Add the buffered records (if any).
    if (this._buffer && SC.typeOf(this._buffer) === SC.T_HASH) {
      var i, id, len = results.length, addedToResults = [];

      for (i = 0; i < len; i++) {
        id = results[i][this.contentItemKey];
        if (SC.typeOf(this._buffer[id]) === SC.T_HASH) {
          results[i] = this._buffer[id];
          addedToResults.push(id);
        }
      }

      for (id in this._buffer) {
        if (this._buffer.hasOwnProperty(id) && addedToResults.indexOf(id) < 0) {
          results.push(this._buffer[id]);
        }
      }
    }

    return results;
  },

  // TODO: [SE, MB] To make this faster...
  // - Compress data [SE: This will likely make it slower]
  // - Put writes into pages
  // - Only write onece per browser session (at window close) [SE: This is dangerous]
  _serializeHash: function(data, key) {
    if (SC.empty(key)) key = this.localStorageKey;
    return window.localStorage.setItem(key, SC.json.encode(data));
  },

  /**
   * Writes a single record or an array of records to the buffer.
   *
   * If the max buffer size is reached, flush the buffer.
   *
   * @param {???} obj The object (or whatever) to save.
   * @param {String} key The key for the object (optional, will default to contentItemKey).
   *
   * @returns {Boolean} YES | NO depending on success.
   */
  save: function(obj, key) {
    if (obj instanceof Array) {
      return this._saveAll(obj, key);
    } else if (!obj) {
      SC.Logger.error('Error writing record to cache: Record is null or undefined.');
      return NO;
    }

    if (SC.empty(key)) key = obj[this.contentItemKey];
    
    if (key) {
      this._buffer[key] = obj;

      if (this._getBufferSize() >= this.maxBufferSize) {
        // Flush the buffer (this is gonna hurt).
        var id, data = this._deserializeHash();

        for (id in this._buffer) {
          if (this._buffer.hasOwnProperty(id)) data[id] = this._buffer[id];
        }

        this._serializeHash(data);
        this._buffer = {};

      } else {
        // Write the buffer to its separate location in local storage.
        this._serializeHash(this._buffer, this._bufferKey);
      }

      return YES;

    } else {
      SC.Logger.error('Error writing record to cache: Invalid key.');
      return NO;
    }
  },

  /**
   * Writes multiple records to the buffer.
   *
   * TODO: [MB] Return YES | NO to pass along to return call from save().
   */
  _saveAll: function(objs, keys) {
    var i, key, length = objs.length || 0;

    if (length > 10 && SC.browser.msie) {
      var startIndex = 0, that = this;
      // TODO: [SE] fix line below when this is ported to IE - currently 'data' in undefined
      // setTimeout(function() { that._chunkSave(data, objs, startIndex, length, keys); }, 150);
    } else {
      // If the number of objects > maxBufferSize, just write directly to local storage; 
      if (length > this.maxBufferSize) {
        var data = this._deserializeHash() || {};

        for (i = 0; i < length; i++) {
          key = (keys && keys.length) ? keys[i] : this.contentItemKey;
          data[objs[i][key]] = objs[i];
        }

        this._serializeHash(data);

      } else {
        // Write to the buffer instead.
        for (i = 0; i < length; i++) {
          key = (keys && keys.length) ? keys[i] : this.contentItemKey;
          this._buffer[objs[i][key]] = objs[i];
        }

        this._serializeHash(this._buffer, this._bufferKey);
      }
    }
  },

  _chunkSave: function(data, array, startIndex, length) {
    var i, newStartIndex = startIndex + 10;

    if (newStartIndex < length) {
      for (i = newStartIndex - 10; i < newStartIndex; i++){
        data[array[i][this.contentItemKey]] = array[i]; 
      }

      var that = this;
      setTimeout(function() { that._chunkSave(data,array,newStartIndex,length); }, 150);

    } else {
      for (i = newStartIndex - 10; i < length; i++){
        data[array[i][this.contentItemKey]] = array[i]; 
      }

      this._serializeHash(data);
    }    
  },

  /**
   * Reads a single record from the local storage.
   */
  get: function(id) {
    // Check the buffer first.
    if (this._buffer && this._buffer[id]) return this._buffer[id];

    // Otherwise deserialize from local storage.
    var data = this._deserializeHash() || {};
    var rec = data[id];
    return rec ? rec : null;
  },

  /**
   * Reads all of the records in this table from the local storage.
   */
  getAll: function() {
    return this._deserializeAsArray();
  },

  /**
   * Removes a single record from the local storage.
   */
  remove: function(id) {
    // Check the buffer first; remove if found.
    if (this._buffer && SC.typeOf(this._buffer[id]) === SC.T_HASH) delete this._buffer[id];

    // Also remove from local storage.
    var data = this._deserializeHash() || {};
    delete data[id];
    this._serializeHash(data);
  },

  /**
   * Removes all data associated with this table from the local storage.
   */
  nuke: function() {
    window.localStorage.removeItem(this.localStorageKey);
    window.localStorage.removeItem(this._bufferKey);
  },

  _getBufferSize: function() {
    var id, size = 0, buffer = this._buffer;

    if (SC.typeOf(buffer) === SC.T_HASH) {
      for (id in buffer) {
        if (buffer.hasOwnProperty(id)) size++;
      }
    }

    return size;
  }
});
