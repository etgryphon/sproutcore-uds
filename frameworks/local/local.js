/*globals  SCUDS Lawnchair*/
sc_require('storage/dom');
sc_require('storage/sqlite');
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
  
  version: '0.1',
  wantsNotification: YES,

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
    var ret = this._dataStores[recordType] || this.generateDataSource(recordType);
    this._dataStores[recordType] = ret;
    return ret;
  },
  
  generateDataSource: function(recordType) {
    var storageMethod = this.get('storageMethod'),
        recordTypeName = SC.browser.msie ? recordType._object_className : recordType.toString();
    
    if (SC.none(storageMethod)) storageMethod = 'dom';
    
    if (storageMethod === 'dom') {
      return SCUDS.DOMStorageAdaptor.create({localStorageKey: recordTypeName + this.get('version')});
    } else if (storageMethod === 'sqlite') {
      return SCUDS.SQLiteStorageAdaptor.create({
        dataSource: this,
        recordType: recordType,
        tableName: recordTypeName + this.get('version')
      });
      
    }
    return null;
  },
  
  /**
   * Called on behalf of store.find(query)
   */
  fetch: function(store, query) {
    var handledTypes = [];
    var errorTypes = [], records, recordType, recordTypeString, ds;
    // Get the record type(s).
    var recordTypes = query.get('recordTypes') || query.get('recordType');
    if (SC.typeOf(recordTypes) === SC.T_CLASS) recordTypes = [recordTypes];
    
    //This function handles pulling the data out of localStorage
    //and pushing it into the store it is invoked later so it does
    //not block any following remote calls...
    var later = function(){
      //SC.Benchmark.start('later');
      // Get all records of specified type from the local cache.
      records = ds.getAll(store, query);
    };
    
    
    // Handle each record type (may only be one).
    for (var i = 0, len = recordTypes.length; i < len; i++) {
      recordType = recordTypes[i];
      recordTypeString = SC.browser.msie ? recordType._object_className : recordType.toString();

      ds = this._getDataStoreForRecordType(recordType);

      if (!ds) continue;

      if (this._beenFetched[recordTypeString]) {
        handledTypes.push(recordTypeString);
        continue;
      }
      SC.Logger.log('Retrieving %@ records from local cache...'.fmt(recordTypeString));
      
      this.invokeLater(later,250);
      handledTypes.push(recordTypeString);
      
    }

    // Let others know that this query was handled by the LDS.  This allows any data sources that
    // appear later in the chain to act accordingly.
    query.set('handledByLDS', handledTypes);

    // If there were errors, let others know about that too.
    query.set('errorsInLDS', errorTypes);

    // Don't stop here in the cascade chain.
    if (handledTypes.length === 0 && errorTypes.length === 0) {
      return NO;
    } else {
      return SC.MIXED_STATE;
    }
  },
  
  dataStoreDidGetHashes: function(hashes, store, query) {
    var recordType = query.get('recordType'),
        recordTypeString = SC.browser.msie ? recordType._object_className : recordType.toString();
    
    if (SC.typeOf(hashes) === SC.T_ARRAY) {
      SC.Logger.log('Found %@ cached %@ records.'.fmt(hashes.length, recordTypeString));
      store.loadRecords(recordType, hashes, undefined, NO);
      this._beenFetched[recordTypeString] = YES;
      
      return YES;
    }
    return NO;
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

    SC.Logger.log('Wrote %@ %@ records to local cache.'.fmt(len, recordType.toString()));
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
    ds.save(dataHash);
    SC.Logger.log('Wrote %@:%@ to local cache.'.fmt(recordType.toString(), id));
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
    var stores = this._dataStores;
    if (SC.typeOf(stores) !== SC.T_HASH) return;
    
    for (var name in stores) {
      if(stores.hasOwnProperty(name)){
        if (stores[name] && stores[name].nuke) stores[name].nuke();
      }
    }
    
    // Reset the data structure.
    this._dataStores = {};
    
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

