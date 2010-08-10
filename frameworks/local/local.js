/*globals Lawnchair google SCUDS*/
sc_require('lib/Lawnchair');
/**
 * An extension of the SC.DataSource class that acts as a proxy between the data store and the
 * Orion REST API (the remote server).
 *
 * @extends SC.DataSource
 * @author Geoffrey Donaldson
 *
 * @version Beta1
 * @since AB2
 */
SCUDS.LocalDataSource = SC.DataSource.extend({

//  init: function() {
//    var source = this._getDataStore('lastRetrievedAt'),
//        self = this ;
//
//    source.get('lastRetrievedAt', function(o) {
//      // Notify the store, but don't save it again.
//      self.lastRetrievedAtDidChange(o.record, NO) ;
//    }) ;
//  },
  
  wantsNotification: YES,
  
  _storageMethod: 'webkit',
  storageMethod: function() {
//    if (this.supports_sql_storage()) {
//      return 'webkit' ;
//    } else
    if (this.supports_gears_storage()) {
      return 'gears' ;
    } else if (this.supports_local_storage()) {
      return 'dom' ;
    }
  }.property().cacheable(),
  
  isTesting: NO,
  
  /**
    A set of compressed record type strings.
    for example: App.Person would become "AppPerson"
    SC.Set.create(["AppPerson"])
    
    SC.Set
   */
  supportedRecordTypes: null,
  
  _dataStoreWithAdapter: {},
  _getDataStore:function(recordType, version) {
    recordType = this._recordTypeToString(recordType) ;
    var ds = this._dataStoreWithAdapter[recordType],
        storageMethod = this.get('storageMethod') ;
    if (ds) return ds ;
    
    console.log('Getting DB with name %@'.fmt(recordType)) ;
    
    ds = new Lawnchair({
      table:recordType, 
      adaptor:storageMethod,
      onError: function(tx, e, msg) {
        console.log("Error!: "+msg);
        console.log(e);
      }
    });
    
    // TODO: test to see if schema version is correct.
    // If not, nuke it.
    
    this._dataStoreWithAdapter[recordType] = ds ;
    return ds ;
  },

  /**
   Holds a hash of timestamps for the lastRetrievedAt time for each record Type
   */
  lastRetrievedAt: {},

  lastRetrievedAtDidChange: function(store, dontSave) {
    var lastRetrievedAt = this.get('lastRetrievedAt'),
        source = this._getDataStore('lastRetrievedAt') ;

    store.set('lastRetrievedAt', lastRetrievedAt) ;

    if (dontSave) return ;
    // Save lastRetrievedAt times to localStorage.
//    source.save({
//      key: 'lastRetrievedAt',
//      record: lastRetrievedAt
//    }, function() {
//      // console.log('Saved times');
//    }) ;
  },

  fetch: function(store, query) {
    console.log("LocalDataSource.fetch") ;
    var recordType = query.get('recordType'),
        self = this, source ;
    
    if(!this._isSupportedRecordType(recordType)) return NO ;
    
    source = this._getDataStore(recordType);
    
    source.all(function(records) {
      self._didFetch(store, source, query, records, recordType) ;
    }) ;
    
    return SC.MIXED_STATE ; // do not stop here.
  },
  
  _didFetch: function(store, source, query, records, recordType) {
    var id, data ;
    console.log("Found %@ saved records".fmt(records.length)) ;
    records.forEach(function(dataHash) {
      data = dataHash.record ;
      if (data) {
        // console.log('Pushing %@ %@'.fmt(self._recordTypeToString(recordType), SC.inspect(data))) ;
        id = data.id ;
        // We can safely push this data AS IS, as the store will ensure that 
        // minimals will not override completes.
        store.pushRetrieve(recordType, id, data) ;
      }
    }) ;
  },

  notifyDidLoadRecord: function(store, recordType, dataHash, id) {
    // console.log('been notified!');
    if(!this._isSupportedRecordType(recordType)) return NO ;
    
    var source = this._getDataStore(recordType),
        key = dataHash.type+'-'+id,
        storeKey = store.storeKeyFor(recordType, id),
        recordTypeStr = this._recordTypeToString(recordType),
        self = this ;

    if ((id+'').indexOf('-') === 0) return ; // we don't want to save a non id'd record.
    // Get the data from the store, to utilise the minimal-complete merge code.
    dataHash = store.readDataHash(storeKey) ; 
    
    // console.log("Saving updated record: %@".fmt(storeKey)) ;
    // console.log(store) ;
    // console.log(dataHash) ;
    
    source.save({
      key: key,
      record: dataHash
    }, function() {
      self.lastRetrievedAt[recordTypeStr] = SC.DateTime.create().get('milliseconds') ;
      self.lastRetrievedAtDidChange(store) ;
    }) ;
  },
  
  retrieveRecord: function(store, storeKey, params) {
    console.log("LocalDataSource.retrieveRecord") ;
    if (!store) {
      console.error('No Store!!!') ;
      return NO ;
    }
    var recordType = store.recordTypeFor(storeKey),
        that       = this,
        id         = store.idFor(storeKey),
        source     = this._getDataStore(recordType),
        datahash   = store.readDataHash(storeKey) ;
    if (!datahash) {
      return NO ;
    }
    var type = datahash.type ;
    
    source.get("%@-%@".fmt(type, id), function(o) {
      that._retrieveCompleted(store, id, o, recordType) ;
    }) ;
    
    return SC.MIXED_STATE ;
  },
  
  _retrieveCompleted: function(store, id, record, recordType) {
    var data = record.record ;
    store.pushRetrieve(recordType, id, data) ;
  },
  
  retrieveRecords: function(store, storeKeys, ids) {
    console.log("LocalDataSource.retrieveRecords") ;
    return this._handleEach(store, storeKeys, this.retrieveRecord, ids);  
  },
  
  createRecord: function(store, storeKey) {
    console.log("LocalDataSource.createRecord") ;
    if (!store) {
      console.error('No Store!!!') ;
      return NO ;
    }
    var recordType = store.recordTypeFor(storeKey),
        id         = store.idFor(storeKey),
        source     = this._getDataStore(recordType),
        dataHash   = store.readDataHash(storeKey),
        key        = dataHash.type+'-'+id,
        that       = this ;

    if ((id+'').indexOf('-') === 0) return ; // we don't want to save a non id'd record.

    source.save({
      key: key,
      record: dataHash
    }, function() {
      console.log('created record was saved') ;
    }) ;
    
    return SC.MIXED_STATE ;
  },
  
  notifyDidCreateRecord: function(store, recordType, dataHash, id) {
    // console.log('been notified!');
    if(!this._isSupportedRecordType(recordType)) return NO ;
    
    var source = this._getDataStore(recordType),
        key = dataHash.type+'-'+id,
        storeKey = store.storeKeyFor(recordType, id) ;

    if ((id+'').indexOf('-') === 0) return ; // we don't want to save a non id'd record.

    // Get the data from the store, to utilise the minimal-complete merge code.
    dataHash = store.readDataHash(storeKey) ; 
    
    // console.log("Saving Created record: %@".fmt(storeKey)) ;
    // console.log(store) ;
    // console.log(dataHash) ;
    
    source.save({
      key: key,
      record: dataHash
    }, function() {
      // console.log('loaded record was saved') ;
    }) ;
  },
  
  destroyRecord: function(store, storeKey, params) {
    console.log("LocalDataSource.destroyRecord") ;
    var recordType = store.recordTypeFor(storeKey),
        id         = store.idFor(storeKey),
        source     = this._getDataStore(recordType),
        type       = store.readDataHash(storeKey).type ;
    
    source.remove("%@-%@".fmt(type, id)) ;
    
    return SC.MIXED_STATE ;
  },

  notifyDidDestroyRecord: function(store, recordType, dataHash, id) {
    // console.log('been notified!');
    if(!this._isSupportedRecordType(recordType)) return NO ;

    var source = this._getDataStore(recordType),
        key = dataHash.type+'-'+id ;

    source.remove(key, function() {
      // console.log('loaded record was saved') ;
    }) ;
  },
  
  updateRecord: function(store, storeKey, params) {
    console.log("LocalDataSource.updateRecord") ;
    if (!store) {
      console.error('No Store!!!') ;
      return NO ;
    }
    var recordType = store.recordTypeFor(storeKey),
        id         = store.idFor(storeKey),
        source     = this._getDataStore(recordType),
        dataHash   = store.readDataHash(storeKey),
        key        = dataHash.type+'-'+id ;
    
    source.save({
      key: key,
      record: dataHash
    }, function() {
      console.log('updated record was saved') ;
    }) ;
    
    return SC.MIXED_STATE ;
  },
  
  nuke: function(recordType) {
    var source = this._getDataStore(recordType) ;
    source.nuke() ;
  },
  
  _recordTypeToString: function(recordType) {
    if (SC.typeOf(recordType) !== SC.T_STRING) {
      recordType = recordType.toString() ;
    }
    // Clean the string, to make sure we don't have any '.'s
    recordType = recordType.replace(/\./, '') ;
    return recordType ;
  },
  
  _isSupportedRecordType: function(recordType) {
    if (this.isTesting) return YES ;
    recordType = this._recordTypeToString(recordType) ;
    var supported = this.get('supportedRecordTypes') ;
    if (supported === null) return YES ; // If nothing is set, allow all.
    return supported.contains(recordType) ;
  },
  
  supports_sql_storage: function() {
    return ('openDatabase' in window) && window['openDatabase'] !== null;
  },
  
  supports_gears_storage: function() {
    return (window.google && google.gears) ;
  },
  
  supports_local_storage: function() {
    return ('localStorage' in window) && window['localStorage'] !== null;
  }
  
}) ;

SCUDS.LocalDataSource.dataStoreWithAdapter = {} ;
SCUDS.LocalDataSource.getDataStore = function(storeName) {
  var ds = SCUDS.LocalDataSource.dataStoreWithAdapter[storeName],
      storageMethod = 'dom' ;
  if (ds) return ds ;

  console.log('.Getting DB with name %@'.fmt(storeName)) ;

  ds = new Lawnchair({
    table:storeName,
    adaptor:storageMethod,
    onError: function(tx, e, msg) {
      console.log("Error!: "+msg);
      console.log(e);
    }
  });

  SCUDS.LocalDataSource.dataStoreWithAdapter[storeName] = ds ;
  return ds ;
} ;

SCUDS.LocalDataSource.clearAll = function(callBack) {
  // TODO: [GD] Make this not just for localStorage in ablove changes.
  console.log('Clearning LocalStorage.') ;
  localStorage.clear() ;
  callBack() ;
}
