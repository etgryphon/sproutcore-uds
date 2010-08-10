/*globals SCUDS */

SCUDS.NotifyingCascadeDataSource = SC.CascadeDataSource.extend(
  /** @scope SCUDS.localSource.prototype */ {
  
  /**
    A Set of dataSources that want to know about query Loads.
  */
  wantsNotification: SC.Set.create(),

  notifyDidLoadRecord: function(store, recordType, dataHash, id) {
    var toNotify = this.wantsNotification,
        primaryKey;
    // console.log("***Cascade.notifyDidLoadRecord");
    // save lookup info
    recordType = recordType || SC.Record;
    if(!id) {
      primaryKey = recordType.prototype.primaryKey ;
      id = dataHash[primaryKey] ;
    }

    toNotify.forEach(function(source) {
      // console.log('notifying Datasource %@ %@ %@'.fmt(recordType.toString(), primaryKey, id));
      source.notifyDidLoadRecord(store, recordType, dataHash, id) ;
    }) ;

  },
  
  notifyDidCreateRecord: function(store, recordType, dataHash, id) {
    var toNotify = this.wantsNotification,
        primaryKey;
    console.log("***Cascade.notifyDidCreateRecord");
    // save lookup info
    recordType = recordType || SC.Record;
    if(!id) {
      primaryKey = recordType.prototype.primaryKey ;
      id = dataHash[primaryKey] ;
    }

    toNotify.forEach(function(source) {
      // console.log('notifying Datasource %@ %@ %@'.fmt(recordType.toString(), primaryKey, id));
      source.notifyDidCreateRecord(store, recordType, dataHash, id) ;
    }) ;
  },
  
  from: function(dataSource) {
    var ret = sc_super();
    if (dataSource.wantsNotification) this.wantsNotification.add(dataSource) ;
    return ret ;
  },
  
  init: function() {
    sc_super();
    
    // if a dataSources array is defined, look for any that want notifcation,
    // then add them to our set.
    var sources = this.get('dataSources'),
        idx     = sources ? sources.get('length') : 0,
        source;
    while(--idx>=0) {
      source = sources[idx];
      if (source.wantsNotification) this.wantsNotification.add(source) ;
    }
    
  }
  
}) ;