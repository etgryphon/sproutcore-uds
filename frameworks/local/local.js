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
  recordRetrievalTimes: YES,
  isTesting: NO,
  
  /*
   * The browser-implemented storage method (default is webkit).
   */
  _storageMethod: 'webkit',

  /**
   * Returns the best available browser-implemented storage method.
   *
   * Order of preference: webkit (default) -> dom
   */
  storageMethod: function() {
    if (this._supportsSqlStorage()) {
      return 'webkit';
    } else if (this._supportsLocalStorage()) {
      return 'dom';
    }
  }.property().cacheable(),
  
  /**
   * A set of compressed record type strings.
   *
   * For example: App.Person would become "AppPerson"
   * SC.Set.create(["AppPerson"])
   * 
   * @returns {SC.Set}
   */
  supportedRecordTypes: null,
 
  /*
   * A list of cached datastores (mostly keyed by record type).
   */
  _dataStoreWithAdapter: {},

  /*
   * Returns a datastore for a particular record type and API version.
   */
  _getDataStore: function(recordType, version) {
    recordType = this._recordTypeToString(recordType);
    var storageMethod = this.get('storageMethod');
    var ds = this._dataStoreWithAdapter[recordType];

    if (ds) {
      // Found cached datastore; return.
      return ds;
    }

    ds = new Lawnchair({
      table: recordType, 
      adaptor: storageMethod,
      onError: function(tx, e, msg) {
        console.error("Lawnchair error: " + msg);
        console.error(e);
      }
    });

    console.log('Created new cached datastore [%@:%@]'.fmt(storageMethod, recordType));
    
    // TODO: [GD/SE] Test to see if schema version is correct; if not, nuke it.
 
    this._dataStoreWithAdapter[recordType] = ds;
    return ds;
  },

  /**
   * A hash of timestamps for the lastRetrievedAt time for each record type.
   */
  lastRetrievedAt: {},

  _lastRetrievedAtDidChange: function(store, dontSave) {
    var lastRetrievedAt = this.get('lastRetrievedAt');
    var ds = this._getDataStore('lastRetrievedAt');

    store.set('lastRetrievedAt', lastRetrievedAt);

    if (dontSave) return;

    // Save lastRetrievedAt times to localStorage.
    ds.save({ key: 'lastRetrievedAt', record: lastRetrievedAt }, function() {});
  },

  /**
   * Called on behalf of store.find(query)
   */
  fetch: function(store, query) {
    var recordType = query.get('recordType');
    if (!this._isSupportedRecordType(recordType)) return NO;

    console.log('Retrieving %@ records from local cache...'.fmt(recordType.toString()));

    var ds;
    var self = this;
 
    ds = this._getDataStore(recordType);
    ds.all(function(records) {
      self._didFetch(store, ds, query, records, recordType);
    });

    // Don't stop here in the cascade chain.
    return SC.MIXED_STATE;
  },
 
  _didFetch: function(store, source, query, records, recordType) {
    var id, data;

    console.log('Found %@ cached %@ records.'.fmt(records.length, recordType.toString()));

    records.forEach(function(dataHash) {
      data = dataHash.record;
      if (data) {
        id = data.id;
        // We can safely push this data AS IS, as the store will ensure that minimals will not
        // override completes.
        store.pushRetrieve(recordType, id, data);
      }
    });

    // Transition the query-backed record array to the READY state so that bindings will fire.
    SC.RunLoop.begin();
    store.dataSourceDidFetchQuery(query);
    SC.RunLoop.end();
  },

  notifyDidLoadRecord: function(store, recordType, dataHash, id) {
    if (!this._isSupportedRecordType(recordType)) return;
    
    var ds = this._getDataStore(recordType);
    var key = dataHash.type + '-' + id;
    var storeKey = store.storeKeyFor(recordType, id);
    var recordTypeStr = this._recordTypeToString(recordType);
    var self = this;

    if ((id + '').indexOf('-') === 0) {
      // Don't want to save a record without an ID.
      return;
    }

    // Get the data from the store, to utilise the minimal-complete merge code.
    dataHash = store.readDataHash(storeKey); 
    
    ds.save({ key: key, record: dataHash }, function() {
      if (this.recordRetrievalTimes === YES) {
        self.lastRetrievedAt[recordTypeStr] = SC.DateTime.create().get('milliseconds');
        self._lastRetrievedAtDidChange(store);
      }
    });
  },

  retrieveRecord: function(store, storeKey, params) {
    if (!store) {
      console.error('Error retrieving record: Invalid store.');
      return NO;
    }

    var recordType = store.recordTypeFor(storeKey);
    if (!this._isSupportedRecordType(recordType)) return NO;

    var that = this;
    var id = store.idFor(storeKey);
    var ds = this._getDataStore(recordType);
    var dataHash = store.readDataHash(storeKey);
    var recTypeStr = recordType.toString();

    if (!dataHash) return NO;

    console.log('Retrieving %@:%@ from local cache...'.fmt(recTypeStr, id));

    var type = dataHash.type;
    
    ds.get("%@-%@".fmt(type, id), function(o) {
      console.log('Found %@:%@ in local cache.'.fmt(recTypeStr, id));
      that._retrieveCompleted(store, id, o, recordType);
    });
    
    return SC.MIXED_STATE;
  },
 
  _retrieveCompleted: function(store, id, record, recordType) {
    var data = record.record;
    SC.RunLoop.begin();
    store.pushRetrieve(recordType, id, data);
    SC.RunLoop.end();
  },
  
  //TODO: [SE, MB] only retreive records when asking for more than one
  //otherwise call the remote data source
  retrieveRecords: function(store, storeKeys, ids) {
    if(storeKeys && storeKeys.get('length') > 1) return this._handleEach(store, storeKeys, this.retrieveRecord, ids);  
    else return NO;
    //return this._handleEach(store, storeKeys, this.retrieveRecord, ids);  
  },
  
  createRecord: function(store, storeKey) {
    if (!store) {
      console.error('Error creating record: Invalid store.');
      return NO;
    }

    var recordType = store.recordTypeFor(storeKey);
    if (!this._isSupportedRecordType(recordType)) return NO;

    var that = this;
    var id = store.idFor(storeKey);
    var ds = this._getDataStore(recordType);
    var dataHash = store.readDataHash(storeKey);
    var key = dataHash.type + '-' + id;

    if ((id + '').indexOf('-') === 0) {
      // Don't want to create a record without an ID.
      return;
    }

    ds.save({ key: key, record: dataHash });

    return SC.MIXED_STATE;
  },
  
  notifyDidCreateRecord: function(store, recordType, dataHash, id) {
    if (!this._isSupportedRecordType(recordType)) return;
    
    var ds = this._getDataStore(recordType);
    var key = dataHash.type + '-' + id;
    var storeKey = store.storeKeyFor(recordType, id);

    if ((id + '').indexOf('-') === 0) {
      // Don't want to create a record without an ID.
      return;
    }

    // Get the data from the store, to utilise the minimal-complete merge code.
    dataHash = store.readDataHash(storeKey); 
    
    ds.save({ key: key, record: dataHash }, function() {
      console.log('Created %@:%@ in local cache.'.fmt(recordType.toString(), id));
    });
  },
  
  destroyRecord: function(store, storeKey, params) {
    if (!store) {
      console.error('Error destroying record: Invalid store.');
      return NO;
    }

    var recordType = store.recordTypeFor(storeKey);
    if (!this._isSupportedRecordType(recordType)) return NO;

    var id = store.idFor(storeKey);
    var ds = this._getDataStore(recordType);
    var type = store.readDataHash(storeKey).type;

    ds.remove("%@-%@".fmt(type, id), function() {
      console.log('Destroyed %@:%@ in local cache.'.fmt(recordType.toString(), id));
    });
    
    return SC.MIXED_STATE;
  },

  notifyDidDestroyRecord: function(store, recordType, dataHash, id) {
    if (!this._isSupportedRecordType(recordType)) return;

    var ds = this._getDataStore(recordType);
    var key = dataHash.type + '-' + id;

    ds.remove(key);
  },
  
  updateRecord: function(store, storeKey, params) {
    if (!store) {
      console.error('Error creating record: Invalid store.');
      return NO;
    }

    var recordType = store.recordTypeFor(storeKey);
    if (!this._isSupportedRecordType(recordType)) return NO;

    var id = store.idFor(storeKey);
    var ds = this._getDataStore(recordType);
    var dataHash = store.readDataHash(storeKey);
    var key = dataHash.type + '-' + id;

    ds.save({ key: key, record: dataHash }, function() {
      console.log('Updated %@:%@ in local cache.'.fmt(recordType.toString(), id));
    });

    return SC.MIXED_STATE;
  },
  
  nuke: function(recordType) {
    var ds = this._getDataStore(recordType);
    ds.nuke();
  },
  
  _recordTypeToString: function(recordType) {
    if (SC.typeOf(recordType) !== SC.T_STRING) {
      recordType = recordType.toString();
    }

    // Clean the string, to make sure we don't have any periods.
    recordType = recordType.replace(/\./, '');
    return recordType;
  },
  
  _isSupportedRecordType: function(recordType) {
    if (this.isTesting) return YES;
    recordType = this._recordTypeToString(recordType);
    var supported = this.get('supportedRecordTypes');
    if (supported === null) return YES; // If nothing is set, allow all.
    return supported.contains(recordType);
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
SCUDS.LocalDataSource.dataStoreWithAdapter = {};

/**
 * Returns a class-level datastore.
 */
SCUDS.LocalDataSource.getDataStore = function(storeName) {
  var ds = SCUDS.LocalDataSource.dataStoreWithAdapter[storeName];
  var storageMethod = 'dom';

  if (ds) return ds;

  console.log('Creating new cached datastore [%@:%@]'.fmt(storageMethod, storeName));

  ds = new Lawnchair({
    table: storeName,
    adaptor: storageMethod,
    onError: function(tx, e, msg) {
      console.error("Lawnchair error: " + msg);
      console.error(e);
    }
  });

  SCUDS.LocalDataSource.dataStoreWithAdapter[storeName] = ds;
  return ds;
};

SCUDS.LocalDataSource.clearAll = function(callback) {
  // TODO: [GD] Make this not just for localStorage in ablove changes.
  localStorage.clear();
  console.log('Cleared local data cache.');
  if (SC.typeOf(callback) === SC.T_FUNCTION) callback();
};
