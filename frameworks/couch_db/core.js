// ==========================================================================
// Project:   CouchDb
// Copyright: ©2011 Evin Grano and Contributors
// ==========================================================================
/*globals SCUDS */

/** @namespace

  My cool new framework.  Describe your framework.
  
  @extends SC.Object
*/
SCUDS.CouchDBDataSource = SC.DataSource.extend({
  
  server: '',
  database: null,
  
  fetch: function(store, query) {
    var rts, that;
    // Do some sanity checking first to make sure everything is in order.
    if (!SC.instanceOf(query, SC.Query)) {
      SC.Logger.error('SCUDS.CouchDBDataSource.fetch(): Error retrieving records: Invalid query.');
      return NO;
    }
    
    // look at the query for all the different record types that are in this query
    // because we will have to break them up into individual batches and sync them up
    // at the end.
    rts = query.get('expandedRecordTypes') || {};
    that = this;

    // Set a few important attributes on the query.
    query.numRecordTypes = rts.get('length')*1; // <= this is the target number of recordTypes to fetch from the backend
    query.numRecordTypesHandled = 0;
    query.recordHashes = {};
    query.needsRefresh = NO;

    // Iterate through each of the record types in the query (there will usually only be one).
    rts.forEach(function(recordType) {
      that._fetchRecordType(recordType, store, query);
    });
    
    return YES; // Not required, but good form.
  },
  
  _fetchRecordType: function(recordType, store, query) {
    var s  = this.get('server'), params,
        db = recordType.prototype.recordDatabase || this.get('database') || 'data',
        docName = recordType ? recordType.prototype.designDocument || 'data' : 'data';  
    if (SC.typeOf(recordType) !== SC.T_CLASS) {
      SC.Logger.error('SCUDS.CouchDBDataSource._fetchRecordType(): Error retrieving records from data source: Invalid record type.');
      return;
    }
    
    // create params...
    params = {store: store, query: query, recordType: recordType};
    // TODO: [EG] check to see if we need to make a specific view call
    this._fetchRecordsCall(db, docName, params);
    
    return YES;
  },
  
  _fetchRecordsCall: function(database, docName, params){
    var rt = params.recordType, q = params.query, recView;
    
    // find the correct view
    if(q) recView = q.view;
    if(SC.none(recView) && rt) recView = rt.prototype.allView || 'all_records'; 
    // generate the url
    SC.Request.getUrl('%@/_design/%@/_view/%@'.fmt(database, docName, recView))
                .set('isJSON', YES)
                .notify(this, this._dataFetchComplete, params)
                .send();
  },
  
  _dataFetchComplete: function(response, params) {
    var store = params.store,
        query = params.query, ret,
        recordType = params.recordType;
    
    query.numRecordTypesHandled++;
    
    if (SC.$ok(response)) {

      // TODO: [EG] loop through the data
      ret = this._parseCouchViewResponse(recordType, response.get('body'));
      store.loadRecords(recordType, ret);
      
      if(query.numRecordTypesHandled >= query.numRecordTypes){
        
        delete query.numRecordTypes;
        delete query.numRecordTypesHandled;
        delete query.recordHashes;
        delete query.needsRefresh;
        
        store.dataSourceDidFetchQuery(query);
        if (query.successfulCallback) query.successfulCallback();
      } 

    // handle error case
    } else {
      store.dataSourceDidErrorQuery(query, response);
      if (query.failureCallback) query.failureCallback(response);
    }
  },
  
  /**************************************************
  *
  * CODE FOR RETRIEVING A SINGLE RECORD
  *
  ***************************************************/
  retrieveRecord: function(store, storeKey, id) {
    // debugger;
    // map storeKey back to record type
    var recordType = SC.Store.recordTypeFor(storeKey),
        db = recordType.prototype.recordDatabase || this.get('database') || 'data',
        url, params, rev;
        
    // Get the id
    id = id || store.idFor(storeKey);

    // decide on the URL based on the record type
    url = (db && id) ? '%@/%@'.fmt(db, id) : null;
    // if no url is found, we don't know how to handle this record
    if (!url) return NO;
    
    params = {store: store, storeKey: storeKey, recordType: recordType, dataType: 'Fetch'};

    // we can handle it, get the URL.
    SC.Request.getUrl(url)
      .set('isJSON', YES)
      .header('Accept', 'application/json, *.*')
      .notify(this, this._wasSuccessfulRecordTransaction, params)
      .send();

    return YES;
  },

  /**************************************************
  *
  * CODE FOR CREATING A SINGLE RECORD
  *
  ***************************************************/
  createRecord: function(store, storeKey, params) {
    // debugger;
    // map storeKey back to record type
    var recordType = SC.Store.recordTypeFor(storeKey),
        db = recordType.prototype.recordDatabase || this.get('database') || 'data',
        url, hash, pk = recordType.prototype.primaryKey;
        
    // decide on the URL based on the record type
    url = (db) ? '%@/'.fmt(db) : null;
    hash = store.readDataHash(storeKey) || {};
    hash._id = hash[pk];
    // if no url is found, we don't know how to handle this record
    if (!url) return NO;
    
    params = params || {};
    params.store = store;
    params.storeKey = storeKey;
    params.recordType = recordType;
    params.dataType = 'Create';

    // we can handle it, get the URL.
    SC.Request.postUrl(url, hash)
      .set('isJSON', YES)
      .header('Accept', 'application/json, *.*')
      .notify(this, this._didCreateRecord, params)
      .send();

    return YES;
  },
  
  /**************************************************
  *
  * CODE FOR UPDATING A SINGLE RECORD
  *
  ***************************************************/
  updateRecord: function(store, storeKey, params) {
    // debugger;
    // map storeKey back to record type
    var recordType = SC.Store.recordTypeFor(storeKey),
        db = recordType.prototype.recordDatabase || this.get('database') || 'data',
        url, hash, id;
        
    // decide on the URL based on the record type
    id = store.idFor(storeKey);
    url = (db) ? '%@/%@'.fmt(db, id) : null;
    hash = store.readDataHash(storeKey);
    hash._id = id;
    // if no url is found, we don't know how to handle this record
    if (!url) return NO;
    
    params = params || {};
    params.store = store;
    params.storeKey = storeKey;
    params.recordType = recordType;
    params.dataType = 'Update';

    // we can handle it, get the URL.
    SC.Request.putUrl(url, hash)
      .set('isJSON', YES)
      .header('Accept', 'application/json, *.*')
      .notify(this, this._wasSuccessfulRecordTransaction, params)
      .send();

    return YES;
  },
    
  /**************************************************
  *
  * CODE FOR DELETING A SINGLE RECORD
  *
  ***************************************************/
  deleteRecord: function(store, storeKey, params) {
    // debugger;
    // map storeKey back to record type
    var recordType = SC.Store.recordTypeFor(storeKey),
        db = recordType.prototype.recordDatabase || this.get('database') || 'data',
        url, hash, id;
        
    // decide on the URL based on the record type
    id = store.idFor(storeKey);
    url = (db) ? '%@/%@'.fmt(db, id) : null;
    if (!url) return NO;
    
    params = params || {};
    params.store = store;
    params.storeKey = storeKey;
    params.recordType = recordType;
    params.dataType = 'Delete';

    // we can handle it, get the URL.
    SC.Request.deleteUrl(url, hash)
      .set('isJSON', YES)
      .header('Accept', 'application/json, *.*')
      .notify(this, this._didDeleteRecord, params)
      .send();

    return YES;
  },

  _didDeleteRecord: function(response, params) {
    var store = params.store,
        storeKey = params.storeKey;

    // normal: load into store...response == dataHash
    if (SC.$ok(response)) {
      store.dataSourceDidComplete(storeKey, response.get('body'));
      
    // error: indicate as such...response == error
    } else {
      store.dataSourceDidError(storeKey, response.get('body'));
    }

  },
  
  /**************************************************
  *
  * CALLBACKS
  *
  ***************************************************/
  successfulFetch: function(storeKeys, params, code){
    // CODE for success
  },
  
  successfulCreate: function(storeKey, params, code){
    // CODE for success
  },
  
  successfulUpdate: function(storeKey, params, code){
    // CODE for success
  },
  
  successfulDelete: function(storeKey, params, code){
    // CODE for success
  },
  
  failureFetch: function(storeKeys, params, code){
    // CODE FOR Failure
  },
  
  failureCreate: function(storeKey, params, code){
    // CODE for success
  },
  
  failureUpdate: function(storeKey, params, code){
    // CODE for success
  },
  
  failureDelete: function(storeKey, params, code){
    // CODE for success
  },
  
    
  /**************************************************
  *
  * UTILITY METHODS
  *
  ***************************************************/
  _wasSuccessfulRecordTransaction: function(response, params) {
    var store = params.store, rt = params.recordType,
        storeKey = params.storeKey, hash, callback = 'defaultCallback',
        pk = rt ? rt.prototype.primaryKey || '_id' : '_id';

    // normal: load into store...response == dataHash

    if (SC.$ok(response)) {
      hash = response.get('body') || {};
      hash[pk] = hash._id;
      SC.Store.replaceIdFor(storeKey, hash._id);
      store.dataSourceDidComplete(storeKey, hash);
      callback = 'successful'+params.dataType;
    // error: indicate as such...response == error
    } else {
      callback = 'failure'+params.dataType;
      store.dataSourceDidError(storeKey, response.get('body'));
    }
    // Do the callback
    if (this[callback]) this[callback](storeKey, params, response.status)
  },
  
  // Parse data from the CouchDB server in a more manageable form
  _parseCouchViewResponse: function(recordType, body){
    if (SC.none(body)) return [];
    var ret = [], rows = body.rows || [],
        pk = recordType ? recordType.prototype.primaryKey || '_id' : '_id';
    
    // loop and strip
    rows.forEach( function(row){
      row.value[pk] = row.value._id;
      ret.push(row.value);
    });
    
    return ret;
  }
});
