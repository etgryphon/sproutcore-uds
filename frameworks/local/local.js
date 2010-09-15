/*globals Lawnchair google SCUDS*/
sc_require('lib/Lawnchair');

/**
 * An extension of the SC.DataSource class that acts as a proxy between the SC datastore and the
 * web browser's local storage mechanism.
 *
 * @extends SC.DataSource
 * @author Geoffrey Donaldson
 * @author Sean Eidemiller
 *
 * @version 0.1
 * @since 0.1
 */
SCUDS.LocalDataSource = SC.DataSource.extend({

  wantsNotification: YES,
  isTesting: NO,
  chunkSize: 200,

  /**
   * Initialize the various data structrues used by the local data source.
   */
  init: function() {
    sc_super();

    // Get the GUID -> type map (from metadata in local storage).
    var ldsStore = SCUDS.LocalDataSource.getDataStore('SCUDS.LocalDataSource');
    var me = this;

    ldsStore.get('guids', function(value) {
      if (value && value.map) me._guidMap = value.map;
    });

    // Generate GUIDs for supported record types not currently in the cached map.
    var types = this._supportedRecordTypes;
    if (types && types.forEach) {
      types.forEach(function(type) {
        if (!me._guidMap[type] && SC.typeOf(type) === SC.T_STRING) {
          me._guidMap[type] = me._getNextGuid();
        }
      });
    }

    // Save changes made to GUID map (if any) back to local storage.
    ldsStore.save({ key: 'guids', map: me._guidMap }, function() {});
  },

  /*
   * A map of supported record types (as SC.Record-extending prototypes) to GUID strings.
   */
  _guidMap: {},

  /*
   * Returns the next available GUID string.
   */
  _getNextGuid: function() {
    var guid;
    var guidMap = this._guidMap;

    if (SC.typeOf(guidMap) === SC.T_HASH) {
      for (guid = Object.size(guidMap); guid < 1024; guid++) {
        if (!Object.containsValue(guidMap, guid)) break;
      }

      // Seriously?  We've already used 1024 GUIDs?
      // TODO: [SE] Handle this.

    } else {
      guid = 1;
    }

    return guid + '';
  },

  /**
   * Returns the best available browser-implemented storage method.
   *
   * Order of preference: webkit -> dom (default)
   */
  storageMethod: function() {
    var ret = 'dom';

    if (this._supportsSqlStorage()) {
      ret = 'webkit';
    } else if (this._supportsLocalStorage()) {
      ret = 'dom';
    }

    SC.Logger.debug('Local storage mechanism: %@'.fmt(ret));
    return ret;

  }.property().cacheable(),
  
  /*
   * A set of supported record types as strings.
   *
   * For example: 'MyApp.Person', 'Calendar.Event', etc...
   *
   * If null, will assume that all record types are supported.
   * 
   * @returns {SC.Set}
   */
  _supportedRecordTypes: null,

  /*
   * Returns YES if the record type is supported; NO if not.
   *
   * @param {SC.Record} recordType
   *
   * @returns {Boolean} YES if supported; NO if not.
   */
  _isRecordTypeSupported: function(recordType) {
    if (this.isTesting) return YES;
    var supported = this._supportedRecordTypes;
    if (supported === null) return YES; // If nothing is set, allow all.
    return supported.contains(recordType.toString());
  },

  /*
   * A list of cached datastores (mostly keyed by record type).
   */
  _datastores: {},

  /*
   * Returns a specific named datastore.
   */
  _getDataStore: function(name) {
    if (SC.empty(name)) return null;

    var storageMethod = this.get('storageMethod');
    var ds = this._datastores[name];

    if (ds) {
      // Found cached datastore; return.
      return ds;
    }

    // Create a new datastore.
    ds = new Lawnchair({
      table: name, 
      adaptor: storageMethod,
      onError: function(tx, e, msg) {
        SC.Logger.error("Lawnchair error: " + msg);
        SC.Logger.error(e);
      }
    });

    // TODO: [GD/SE] Test to see if schema version is correct; if not, nuke it.
 
    // Cache the datastore and return.
    this._datastores[name] = ds;
    return ds;
  },

  /*
   * Returns the datastore for the given record type.
   */
  _getDataStoreForRecordType: function(recordType) {
    if (SC.typeOf(recordType) !== SC.T_CLASS) return null;
    return this._getDataStore(this._guidMap[recordType.toString()]);
  },

  /**
   * Called on behalf of store.find(query)
   */
  fetch: function(store, query) {
    var recordType = query.get('recordType');
    if (!this._isRecordTypeSupported(recordType)) return NO;

    SC.Logger.log('Retrieving %@ records from local cache...'.fmt(recordType.toString()));

    var ds;
    var me = this;

    // Let others know that this query was handled by the LDS.
    query.set('handledByLDS', YES);
 
    // Get all records of specified type from the local cache.
    ds = this._getDataStoreForRecordType(recordType);
    ds.all(function(records) {
      me._didFetch(store, query, records, recordType);
    });

    // Don't stop here in the cascade chain.
    return SC.MIXED_STATE;
  },
 
  _didFetch: function(store, query, records, recordType) {
    SC.Logger.log('Found %@ cached %@ records.'.fmt(records.length, recordType.toString()));
    store.loadRecords(recordType, records, undefined, NO);
    store.dataSourceDidFetchQuery(query);
  },

  /**
   * Called by the notifying store when multiple records are loaded outside the context of this
   * data source.
   */
  notifyDidLoadRecords: function(store, recordType, dataHashes, ids) {
    if (!this._isRecordTypeSupported(recordType)) return;

    var len = (dataHashes && dataHashes.length) ? dataHashes.length : 0;

    // Short circuit if there's nothing to load.
    if (len === 0) return;

    var me = this;
    var ds = this._getDataStoreForRecordType(recordType);
    var pk = recordType.prototype.primaryKey;
    var sk, id;

    if (!ids) ids = [];

    // Get the data from the store to utilize the minimal-complete merge code.
    for (var i = 0; i < len; i++) { 
      if (ids[i]) {
        id = ids[i];
      } else {
        id = ids[i] = dataHashes[i][pk];
      }

      sk = store.storeKeyFor(recordType, id);
      dataHashes[i] = store.readDataHash(sk);
    }

    // Write the records to the local storage (in chunks).
    this._chunkedLoad(store, recordType, dataHashes, ids, 0, ds);
  },

  /*
   * Writes an array of record data hashes to the store in chunks to increase performance in slower
   * browsers.
   */
  _chunkedLoad: function(store, recordType, dataHashes, ids, startIndex, ds) {
    var chunkSize = this.get('chunkSize');
    var len = ids.length;
    var me = this;

    // Checked for chunked loading support on Lawnchair adapter and whether we should even bother.
    if (!ds.adaptor.supportsChunkedLoads || len - startIndex < chunkSize) {
      var finalizeLoad = function() {
        SC.Logger.log('Wrote %@ %@ records to local cache.'.fmt(len, recordType.toString()));
      };

      // Final or only chunked load (execute after 500ms).
      this.invokeLater(function() {
        ds.save({ key: ids, records: dataHashes, startIndex: startIndex, count: chunkSize },
          finalizeLoad);
      }, 500);

    } else {
      // First or subsequent chunked load (execute after 500ms).
      this.invokeLater(function() {
        ds.save({ key: ids, records: dataHashes, startIndex: startIndex, count: chunkSize });
        me._chunkedLoad(store, recordType, dataHashes, ids, startIndex + chunkSize, ds);
      }, 500);
    }
  },

  retrieveRecord: function(store, storeKey, params) {
    if (!store) {
      SC.Logger.error('Error retrieving record: Invalid store.');
      return NO;
    }

    var recordType = store.recordTypeFor(storeKey);
    if (!this._isRecordTypeSupported(recordType)) return NO;

    var me = this;
    var id = store.idFor(storeKey);
    var ds = this._getDataStoreForRecordType(recordType);
    var dataHash = store.readDataHash(storeKey);
    var recTypeStr = recordType.toString();

    if (!dataHash) return NO;

    SC.Logger.log('Retrieving %@:%@ from local cache...'.fmt(recTypeStr, id));

    var type = dataHash.type;
    
    ds.get(id, function(o) {
      SC.Logger.log('Found %@:%@ in local cache.'.fmt(recTypeStr, id));
      me._retrieveCompleted(store, id, o, recordType);
    });
    
    return SC.MIXED_STATE;
  },
 
  _retrieveCompleted: function(store, id, record, recordType) {
    var data = record;
    SC.RunLoop.begin();
    store.pushRetrieve(recordType, id, data);
    SC.RunLoop.end();
  },
  
  retrieveRecords: function(store, storeKeys, ids) {
    // Only retrieve records when asking for more than one, otherwise forward to the next data
    // source in the chain.
    if (storeKeys && storeKeys.get('length') > 1) {
      return this._handleEach(store, storeKeys, this.retrieveRecord, ids);  
    } else {
      return NO;
    }

    // return this._handleEach(store, storeKeys, this.retrieveRecord, ids);  
  },

  /**
   * Called by the notifying store when a single record is loaded outside the context of this
   * data source.
   */
  notifyDidLoadRecord: function(store, recordType, dataHash, id) {
    if (!this._isRecordTypeSupported(recordType)) return;

    var ds = this._getDataStoreForRecordType(recordType);
    var storeKey = store.storeKeyFor(recordType, id);
    var me = this;

    // Get the data from the store to utilise the minimal-complete merge code.
    dataHash = store.readDataHash(storeKey);

    // Write the record to the local storage.
    ds.save({ key: id, record: dataHash }, function() {
      SC.Logger.log('Wrote %@:%@ to local cache.'.fmt(recordType.toString(), id));
    });
  },

  /**
   * Called by the notifying store when a single record is written to the store outside the context
   * of this data source.
   */
  notifyDidWriteRecord: function(store, recordType, dataHash, id) {
    if (!this._isRecordTypeSupported(recordType)) return;

    var ds = this._getDataStoreForRecordType(recordType);
    var storeKey = store.storeKeyFor(recordType, id);

    ds.save({ key: id, record: dataHash }, function() {
      SC.Logger.log('Wrote %@:%@ to local cache.'.fmt(recordType.toString(), id));
    });
  },
  
  /**
   * Called by the notifying store when a single record is deleted outside the context of this
   * data source.
   */
  notifyDidDestroyRecord: function(store, recordType, id) {
    if (!this._isRecordTypeSupported(recordType)) return;
    var ds = this._getDataStoreForRecordType(recordType);

    ds.remove(id, function() {
      SC.Logger.log('Deleted %@:%@ from local cache.'.fmt(recordType.toString(), id));
    });
  },

  /**
   * Removes all locally-cached data for the given record type.
   */
  nukeType: function(recordType) {
    var ds = this._getDataStoreForRecordType(recordType);
    ds.nuke();
  },

  /**
   * Removes all locally-cached data (all record types).
   */
  nuke: function() {
    // Nuke each datastore.
    var stores = this._datastores;
    if (SC.typeOf(stores) !== SC.T_HASH) return;

    for (var name in stores) {
      if (stores[name] && stores[name].nuke) stores[name].nuke();
    }

    // Reset the data structure.
    this._datastores = {};

    SC.Logger.log('Cleared all data in local cache.');
  },
 
  _supportsSqlStorage: function() {
    return ('openDatabase' in window) && window['openDatabase'] !== null;
  },
 
  _supportsGearsStorage: function() {
    return (window.google && google.gears);
  },
 
  _supportsLocalStorage: function() {
    return ('localStorage' in window) && window['localStorage'] !== null;
  }
});

// Class-level datastores.
SCUDS.LocalDataSource.datastores = {};

/**
 * Returns a class-level datastore.
 */
SCUDS.LocalDataSource.getDataStore = function(storeName) {
  var ds = SCUDS.LocalDataSource.datastores[storeName];
  var storageMethod = 'dom';

  if (ds) return ds;

  ds = new Lawnchair({
    table: storeName,
    adaptor: storageMethod,
    onError: function(tx, e, msg) {
      SC.Logger.error("Lawnchair error: " + msg);
      SC.Logger.error(e);
    }
  });

  SCUDS.LocalDataSource.datastores[storeName] = ds;
  return ds;
};

/**
 * Clears all class-level datastores.
 */
SCUDS.LocalDataSource.clearAll = function(callback) {
  // Nuke each class-level datastore.
  var stores = SCUDS.LocalDataSource.datastores;
  if (SC.typeOf(stores) !== SC.T_HASH) return;

  for (var name in stores) {
    if (stores[name] && stores[name].nuke) stores[name].nuke();
  }

  // Reset the data structure.
  SCUDS.LocalDataSource.datastores = {};

  SC.Logger.log('Cleared class-level datastores.');

  // Invoke the callback.
  if (SC.typeOf(callback) === SC.T_FUNCTION) callback();
};

Object.size = function(obj) {
  var size = 0, key;

  for (key in obj) {
    if (obj.hasOwnProperty(key)) size++;
  }

  return size;
};

Object.containsValue = function(obj, value) {
  var key;

  for (key in obj) {
    if (obj.hasOwnProperty(key) && obj[key] === value) return true;
  }

  return false;
};

