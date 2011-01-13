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
    var s  = this.get('server'),
        db = this.get('database') || 'data', params,
        docName = recordType ? recordType.prototype.designDocument || 'data' : 'data';  
    if (SC.typeOf(recordType) !== SC.T_CLASS) {
      SC.Logger.error('SCUDS.CouchDBDataSource._fetchRecordType(): Error retrieving records from data source: Invalid record type.');
      return;
    }
    
    // create params...
    params = {store: store, query: query, recordType: recordType};
    // TODO: [EG] check to see if we need to make a specific view call
    this._allRecordsCall(db, docName, params);
    
    return YES;
  },
  
  _allRecordsCall: function(database, docName, params){
    var rt = params.recordType,
        allRecView = rt ? rt.prototype.allView || 'all_records' : 'all_records';
    // generate the url
    SC.Request.getUrl('%@/_design/%@/_view/%@'.fmt(database, docName, allRecView))
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
      } 

    // handle error case
    } else store.dataSourceDidErrorQuery(query, response);
  },
  
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
