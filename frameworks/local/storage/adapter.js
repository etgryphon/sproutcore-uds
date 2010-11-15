/* globals SCUDS */

/**
 * The storage adapter base class.
 *
 * @extends SC.Object
 * @author Sean Eidemiller
 *
 * @version 0.1
 */
SCUDS.LocalStorageAdapter = SC.Object.extend(
  /** @scope SCUDS.LocalStorageAdapter.prototype */ {
 
  // The storage key, which will usually be the record type string.
  localStorageKey: '',

  // The key (unique identifier).
  contentItemKey: 'id',

  shouldBenchmark: NO,

  /**
   * Writes a single record or an array of records to local storage.
   *
   * @param {???} obj The object (or whatever) to save.
   * @param {String} key The key of the object (optional, will default to contentItemKey).
   *
   * @returns {Boolean} YES | NO depending on success.
   */
  save: function(obj, key) {
    SC.Logger.warn('Local storage: save() not implemented.');
    return NO;
  },

  /**
   * Reads a single record from local storage.
   *
   * @param {String} id The unique ID of the object to read.
   */
  get: function(id) {
    SC.Logger.warn('Local storage: get() not implemented.');
    return null;
  },

  /**
   * Reads all of the records associated with this record type from local storage.
   */
  getAll: function() {
    SC.Logger.warn('Local storage: getAll() not implemented');
    return null;
  },

  /**
   * Removes a single record from local storage.
   *
   * @param {String} id The unique ID of the object to remove.
   *
   * @returns {Boolean} YES | NO depending on success.
   */
  remove: function(id) {
    SC.Logger.warn('Local storage: remove() not implemented.'); 
    return NO;
  },

  /**
   * Removes all data associated with this record type from local storage.
   *
   * @returns {Boolean} YES | NO depending on success.
   */
  nuke: function() {
    SC.Logger.warn('Local storage: nuke() not implemented.');
    return NO;
  }
});

SCUDS.LocalStorageAdapterFactory = SC.Object.create({

  _cachedAdapters: {},
  _adapterClass: null,

  /**
   * Returns the adapter class type.
   *
   * This method will attempt to determine the most sophisticated storage mechanism supported by
   * the browser and return the corresponding adapter.
   *
   * Furthermore, this method is public because client applications may want to make certain
   * decisisions based upon which type of adapter is being used.  For example, supporting
   * additional record types if a more sophisticated storage mechanism like SQLite is available.
   *
   * Currently supported: DOM Storage (slow in Firefox)
   *
   * TODO: [SE] Add adapter detection.
   */
  getAdapterClass: function() {
    if (!this._adapterClass) this._adapterClass = SCUDS.DOMStorageAdapter; 
    return this._adapterClass;
  },

  /**
   * A factory method that returns an adapter given a key.
   */
  getAdapter: function(key) {
    if (SC.empty(key)) {
      SC.Logger.error('Local storage: Invalid adapter key.');
      return null;
    } else if (SC.typeOf(key) !== SC.T_STRING) {
      key = SC.browser.msie ? key._object_className : key.toString();
    }

    // Return cached adapter if available.
    if (this._cachedAdapters[key]) return this._cachedAdapters[key];

    // Otherwise, create a new adapter (and cache it).
    var adapter = this.getAdapterClass().create({ localStorageKey: key });
    this._cachedAdapters[key] = adapter;
    return adapter;
  },

  /**
   * Returns all of the storage adapters created by this factory as an array.
   */
  getAllAdapters: function() {
    var adapters;

    for (var key in this._cachedAdapters) {
      if (this._cachedAdapters.hasOwnProperty(key)) {
        if (!adapters) adapters = [];
        adapters.push(this._cachedAdapters[key]);
      }
    }

    return adapters;
  },

  /**
   * Nukes all of the storage adapters created by this factory.
   */
  nukeAllAdapters: function() {
    var adapters = this.getAllAdapters();
    if (!adapters) return;

    SC.Logger.info('Local storage: Nuking all adapters.');

    for (var i = 0, len = adapters.length; i < len; i++) {
      adapters[i].nuke();
    }
  }
});
