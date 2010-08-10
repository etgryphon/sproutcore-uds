
/**

 NotifyingStore will notify the dataSource (usually SCUDS.NotifyingCascadeDataSource)
 of any changes that should be bubbled through all dataSources.

 @Author: GD
 */
SCUDS.NotifyingStore = SC.Store.extend({

  /**
   Holds a hash of timestamps for the lastRetrievedAt time for each record Type
   */
  lastRetrievedAt: {},

  /**
    Overrides loadRecord() in SC.Store to notifiy cascadingDataSource of record changes

  */
  loadRecord: function(recordType, dataHash, id) {
    var dataSource = this._getDataSource() ;

    if (dataHash.status === "deleted") {
      // TODO: is this the best way to do this?
      this.pushDestroy(recordType, id) ;
      dataSource.notifyDidDestroyRecord(this, recordType, dataHash, id) ;
      return ;
    }

    var ret = sc_super() ;
    // console.log('Store.loadRecord - %@'.fmt(id));
    
    if (dataSource.wantsNotification) dataSource.notifyDidLoadRecord(this, recordType, dataHash, id) ;
    
    return ret ;
  },
  
  createRecord: function(recordType, dataHash, id) {
    var ret = sc_super(),
        dataSource = this._getDataSource() ;
    console.log('Store.createRecord');
    if (dataSource.wantsNotification) {
      var primaryKey = recordType.prototype.primaryKey,
          storeKey = ret.get('storeKey') ;
      id = ret.get(primaryKey) ;
      dataHash = this.readDataHash(storeKey) ;
      dataSource.notifyDidCreateRecord(this, recordType, dataHash, id) ;
    }
    return ret ;
  }
}) ;