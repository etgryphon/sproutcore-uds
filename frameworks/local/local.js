/*globals  SCUDS Lawnchair*/
sc_require('dom');
sc_require('lib/Lawnchair');

/**
 * An extension of the SC.DataSource class that acts as a proxy between the SC datastore and the
 * web browser's local storage mechanism.
 *
 * @extends SC.DataSource
 *
 * @version 0.1
 * @since 0.1
 */
SCUDS.LocalDataSource = SC.DataSource.extend({

  wantsNotification: YES,

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
    var rt = SC.browser.msie ? recordType._object_className : recordType.toString();
    return supported.contains(rt);
  },
  
  _dataStores: {},
  
  
  // this contains all the record types that have been fetch this session
  // you probably don't need anything in the LDS at this point...
  _beenFetched: {},
  
  _getDataStoreForRecordType: function(recordType){
    if(!this._isRecordTypeSupported(recordType)) return NO;
    recordType = SC.browser.msie ? recordType._object_className : recordType.toString();
    var ret = this._dataStores[recordType] || SCUDS.DOMStorageAdapter.create({localStorageKey: recordType});
    this._dataStores[recordType] = ret;
    return ret;
  },

  /**
   * Called on behalf of store.find(query)
   */
  fetch: function(store, query) {
    var recordType = query.get('recordType');
    var ds = this._getDataStoreForRecordType(recordType);    
    if (!ds) return NO;
    if(this._beenFetched[recordType]) return NO;
    
    SC.Logger.log('Retrieving %@ records from local cache...'.fmt(recordType.toString()));

    // Let others know that this query was handled by the LDS.
    query.set('handledByLDS', YES);
 
    // Get all records of specified type from the local cache.
    var records = ds.getAll();
    if (SC.typeOf(records) !== SC.T_ARRAY) {
      // Something bad happened and the cache was likely nuked, so indicate on the query that there
      // was an error in the LDS.  This allows any data sources that appear later in the chain to
      // act accordingly.
      query.set('errorInLDS', YES);
      return NO;
    }
    
    SC.Logger.log('Found %@ cached %@ records.'.fmt(records.length, recordType.toString()));
    store.loadRecords(recordType, records, undefined, NO);
    store.dataSourceDidFetchQuery(query);
    this._beenFetched[recordType] = YES;
    
    // Don't stop here in the cascade chain.
    return SC.MIXED_STATE;
  },


  /**
   * Called by the notifying store when multiple records are loaded outside the context of this
   * data source.
   */
  notifyDidLoadRecords: function(store, recordType, dataHashes, ids) {
    var ds = this._getDataStoreForRecordType(recordType);    
    if (!ds) return;
    
    var len = (dataHashes && dataHashes.length) ? dataHashes.length : 0;
    // Short circuit if there's nothing to load.
    if (len === 0) return;
    ds.save(dataHashes);
  },


  retrieveRecord: function(store, storeKey, params) {
    // if (!store) {
    //   SC.Logger.error('Error retrieving record: Invalid store.');
    //   return NO;
    // }
    //   
    // var recordType = store.recordTypeFor(storeKey);
    // if (!this._isRecordTypeSupported(recordType)) return NO;
    //   
    // var me = this;
    // var id = store.idFor(storeKey);
    // var ds = this._getDataStoreForRecordType(recordType);
    // var dataHash = store.readDataHash(storeKey);
    // var recTypeStr = recordType.toString();
    //   
    // if (!dataHash) return NO;
    //   
    // SC.Logger.log('Retrieving %@:%@ from local cache...'.fmt(recTypeStr, id));
    //   
    // var type = dataHash.type;
    // 
    // ds.get(id, function(o) {
    //   SC.Logger.log('Found %@:%@ in local cache.'.fmt(recTypeStr, id));
    //   me._retrieveCompleted(store, id, o, recordType);
    // });
    // 
    // return SC.MIXED_STATE;
    return NO;
  },
   
  _retrieveCompleted: function(store, id, record, recordType) {
    var data = record;
    SC.RunLoop.begin();
    store.pushRetrieve(recordType, id, data);
    SC.RunLoop.end();
  },
  
  retrieveRecords: function(store, storeKeys, ids) {
    // // Only retrieve records when asking for more than one, otherwise forward to the next data
    // // source in the chain.
    // if (storeKeys && storeKeys.get('length') > 1) {
    //   return this._handleEach(store, storeKeys, this.retrieveRecord, ids);  
    // } else {
    //   return NO;
    // }
    //   
    // // return this._handleEach(store, storeKeys, this.retrieveRecord, ids);  
    return NO;
  },

  /**
   * Called by the notifying store when a single record is loaded outside the context of this
   * data source.
   */
  notifyDidLoadRecord: function(store, recordType, dataHash, id) {
    // if (!this._isRecordTypeSupported(recordType)) return;
    //   
    // var ds = this._getDataStoreForRecordType(recordType);
    // var storeKey = store.storeKeyFor(recordType, id);
    // var me = this;
    //   
    // // Get the data from the store to utilise the minimal-complete merge code.
    // dataHash = store.readDataHash(storeKey);
    //   
    // // Write the record to the local storage.
    // ds.save({ key: id, record: dataHash }, function() {
    //   SC.Logger.log('Wrote %@:%@ to local cache.'.fmt(recordType.toString(), id));
    // });
  },

  /**
   * Called by the notifying store when a single record is written to the store outside the context
   * of this data source.
   */
  notifyDidWriteRecord: function(store, recordType, dataHash, id) {
    var ds = this._getDataStoreForRecordType(recordType);    
    if (!ds) return;
    ds.save(dataHash);
    SC.Logger.log('Wrote %@:%@ to local cache.'.fmt(recordType.toString(), id));
  },
  
  /**
   * Called by the notifying store when a single record is deleted outside the context of this
   * data source.
   */
  notifyDidDestroyRecord: function(store, recordType, id) {
    var ds = this._getDataStoreForRecordType(recordType);    
    if (!ds) return;
    ds.remove(id);
    SC.Logger.log('Deleted %@:%@ from local cache.'.fmt(recordType.toString(), id));
  },

  /**
   * Removes all locally-cached data for the given record type.
   */
  nukeType: function(recordType) {
    var ds = this._getDataStoreForRecordType(recordType);
    console.log('nukeing record type');
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
      if(stores.hasOwnProperty(name)){
        if (stores[name] && stores[name].nuke) stores[name].nuke();
      }
    }

    // Reset the data structure.
    this._datastores = {};

    SC.Logger.log('Cleared all data in local cache.');
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

