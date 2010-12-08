/*globals  SCUDS Lawnchair*/
sc_require('storage/dom');
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
SCUDS.IE_CHUNK_SIZE = 25;
 
SCUDS.LocalDataSource = SC.DataSource.extend({
  
  version: '0.1',
  wantsNotification: YES,

  _dataNuked: NO,

  _dataStores: {},

  /*
   * This contains all the record types that have been fetched so far during this session.
   * You probably don't need anything in the LDS at this point...
   */
  _beenFetched: {}, 

  /*
   * A set of supported record types as strings.
   *
   * For example: 'MyApp.Person', 'Calendar.Event', etc...
   *
   * If null, will assume that all record types are supported.
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
    if (!recordType) return NO;
    var rt = SC.browser.msie ? recordType._object_className : recordType.toString();
    return supported.contains(rt);
  },
 
  /*
   * Returns a cached data store for the given record type.
   */
  _getDataStoreForRecordType: function(recordType){
    if (!this._isRecordTypeSupported(recordType)) return NO;
    recordType = SC.browser.msie ? recordType._object_className : recordType.toString();
    var ret = this._dataStores[recordType] ||
      SCUDS.DOMStorageAdapter.create({ localStorageKey: recordType + this.get('version') });
    this._dataStores[recordType] = ret;
    return ret;
  },

  /**
   * Called on behalf of store.find(query)
   */
  fetch: function(store, query) {
    var handledTypes = [], recordType, recordTypeString, ds, that = this;

    // Get the record type(s).
    var recordTypes = query.get('recordTypes') || query.get('recordType');
    if (SC.typeOf(recordTypes) === SC.T_CLASS) recordTypes = [recordTypes];

    // Check to see if we handle any of the record types.
    for (var i = 0, len = recordTypes.length; i < len; i++) {
      recordType = recordTypes[i];
      recordTypeString = SC.browser.msie ? recordType._object_className : recordType.toString();
      ds = this._getDataStoreForRecordType(recordType);
      if (ds) handledTypes.push(recordTypeString);
    }

    if (handledTypes.length === 0) return NO;

    // Let others know that this query was handled by the LDS.  This allows any data sources that
    // appear later in the chain to act accordingly.
    query.set('handledByLDS', handledTypes);

    // Also let others know if the data was nuked.
    if (this._dataNuked) {
      query.set('dataNukedInLDS', YES);
      this._dataNuked = NO;
    }

    // Invoke the fetch/load mechanism later on so that we don't block anything.
    this.invokeLater(function(){
      that._fetchDataAndLoadRecords(recordTypes, store, query);
    }, 250);
    
    // Don't stop here in the cascade chain.
    return SC.MIXED_STATE;
  },

  /*
   * Pulls the data out of local storage and pushes it into the store.
   *
   * Invoked later so that it doesn't block anything that happens after fetch() does what it needs
   * to do.
   */
  _fetchDataAndLoadRecords: function(recordTypes, store, query){
    var recordType = recordTypes.pop(), that = this;
    var ds = this._getDataStoreForRecordType(recordType);
    
    var recordTypeString;
    if (recordType) recordTypeString = SC.browser.msie ? recordType._object_className : recordType.toString();
    
    if (ds && !this._beenFetched[recordTypeString]) {
      var records = ds.getAll();

      // TODO: [SE, MB] It's too late at this point to acknowledge the errors in the RDS.
      // Something bad happened and the cache was likely nuked.
      if (SC.typeOf(records) !== SC.T_ARRAY) {
        var errorTypes = query.get('errorsInLDS') || [];
        errorTypes.push(recordTypeString);
        // If there were errors, let others know about that too.
        query.set('errorsInLDS', errorTypes);
        return;
      }

      SC.Logger.log('Found %@ cached %@ records in local cache.'.fmt(records.length, recordTypeString));
       if (SC.browser.msie) {
          setTimeout(function() {
            that._chunkedLoad(records, recordType, store, function() {
              that._beenFetched[recordTypeString] = YES;
            });
          }, 150);

        } 
        else {
          store.loadRecords(recordType, records, undefined, NO);
          this._beenFetched[recordTypeString] = YES;
        }
      
    }

    if (recordTypes.get('length') > 0) {
      this.invokeLater(function(){
        that._fetchDataAndLoadRecords(recordTypes, store, query);
      }, 250);
    }
  },
  
  _chunkedLoad: function(records, recordType, store, callback) {
    var that = this, currentSet, nextSet;

    if (records.get('length') > SCUDS.IE_CHUNK_SIZE) {
      currentSet = records.slice(0, SCUDS.IE_CHUNK_SIZE);
      nextSet = records.slice(SCUDS.IE_CHUNK_SIZE, records.get('length'));
    } else {
      currentSet = records;
    }

    store.loadRecords(recordType, records, undefined, NO);
    if (nextSet){
      setTimeout(function(){
        that._chunkedLoad(nextSet, recordType, store, callback);
      },150);
    }
    else {
      if (callback) callback();
    }
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

    if (this._save(ds, dataHashes)) {
      SC.Logger.log('Wrote %@ %@ records to local cache.'.fmt(len, recordType.toString()));
    }
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
    // var data = record;
    // SC.RunLoop.begin();
    // store.pushRetrieve(recordType, id, data);
    // SC.RunLoop.end();
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
    var ds = this._getDataStoreForRecordType(recordType);    
    if (!ds) return;
    if (this._save(ds, dataHash)) {
      SC.Logger.log('Wrote %@:%@ to local cache.'.fmt(recordType.toString(), id));
    }
  },

  /**
   * Called by the notifying store when a single record is written to the store outside the context
   * of this data source.
   */
  notifyDidWriteRecord: function(store, recordType, dataHash, id) {
    var ds = this._getDataStoreForRecordType(recordType);    
    if (!ds) return;
    if (this._save(ds, dataHash)) {
      SC.Logger.log('Wrote %@:%@ to local cache.'.fmt(recordType.toString(), id));
    }
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
  },

  /*
   * Wrapper for save() on the storage adapter.
   *
   * Nukes all of the data in the local storage if the save fails for any reason.
   */
  _save: function(ds, data) {
    try {
      ds.save(data);
      return YES;
    } catch(e) {
      // Something really bad happened (like the browser ran out of memory in the local storage),
      // so nuke everything and start over.
      SC.Logger.warn('Ran out of memory in local cache; clearing...');
      this.nuke();
      this._dataNuked = YES;
      return NO;
    }
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

