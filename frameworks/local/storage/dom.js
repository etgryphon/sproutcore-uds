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
  /** @scope SCUDS.DOMStorageAdapter.prototype */{
 
  localStorageKey: '',
  contentItemKey: 'id',

  _deserializeHash: function() {
    var key = this.localStorageKey, results;

    try {
      results = SC.json.decode(window.localStorage.getItem(key)) || {};
    } catch(e) {
      SC.Logger.warn('Error during deserialization of records; clearing the cache.');
      this.nuke();
      results = {};
    }

    return results;
  },

  _deserializeAsArray: function(){
    var key = this.localStorageKey, results;

    try {
      var data = window.localStorage.getItem(key) || '';
      data = data.replace(/\"[0-9]+\":/gi,'');
      results = SC.json.decode('[' + data.substring(1, data.length - 1) + ']') || [];
    } catch(e) {
      SC.Logger.warn('Error during deserialization of records; clearing the cache.');
      this.nuke();
      results = [];
    }

    return results;
  },

  // TODO: [SE, MB] To make this faster...
  // - Compress data [SE: This will likely make it slower]
  // - Put writes into pages
  // - Only write onece per browser session (at window close) [SE: This is dangerous]
  _serializeHash: function(data){
    var ret = window.localStorage.setItem(this.localStorageKey, SC.json.encode(data));
    return ret;
  },

  /**
   * Writes a single record or an array of records to the local storage.
   *
   * @param {???} obj The object (or whatever) to save.
   * @param {String} key The key for the object (optional, will default to contentItemKey).
   *
   * @returns {Boolean} YES | NO depending on success.
   */
  save: function(obj, key) {
    if (obj instanceof Array) {
      return this._saveAll(obj);
    } else if (!obj) {
      SC.Logger.error('Error writing record to cache: Record is null or undefined.');
      return NO;
    }

    if (SC.typeOf(key) !== SC.T_STRING) key = obj[this.contentItemKey];
    
    if (key) {
      var data = this._deserializeHash();
      data[key] = obj;
      this._serializeHash(data);
      return YES;
    } else {
      SC.Logger.error('Error writing record to cache: Invalid key.');
      return NO;
    }
  },

  /**
   * Writes multiple records to the local storage.
   *
   * TODO: [MB] Return YES | NO to pass along to return call from save().
   */
  _saveAll: function(array) {
    var data = this._deserializeHash();
    var length = array.length;

    if (length > 10 && SC.browser.msie) {
      var startIndex = 0, that = this;
      setTimeout(function() { that._chunkSave(data, array, startIndex, length); }, 150);
    } else {
      for (var i = 0; i < length; i++) {
        data[array[i][this.contentItemKey]] = array[i];
      }

      this._serializeHash(data);
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
      for(i = newStartIndex - 10; i < length; i++){
        data[array[i][this.contentItemKey]] = array[i]; 
      }

      this._serializeHash(data);
    }    
  },

  /**
   * Reads a single record from the local storage.
   */
  get: function(id) {
    var data = this._deserializeHash();
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
    var data = this._deserializeHash();
    delete data[id];
    this._serializeHash(data);
  },

  /**
   * Removes all data associated with this table from the local storage.
   */
  nuke: function() {
    window.localStorage.removeItem(this.localStorageKey);
  }
});
