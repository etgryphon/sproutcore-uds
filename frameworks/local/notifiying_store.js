/**
 * NotifyingStore will notify the data source (usually SCUDS.NotifyingCascadeDataSource)
 * of any changes that should be bubbled through all dataSources.
 *
 * @author Geoffrey Donaldson
 */
SCUDS.NotifyingStore = SC.Store.extend({

  /**
   * A hash of timestamps for the lastRetrievedAt time for each record type.
   */
  lastRetrievedAt: {},

  /**
   * Overrides loadRecord() in SC.Store to notifiy cascadingDataSource of record changes.
   */
  loadRecord: function(recordType, dataHash, id) {
    var dataSource = this._getDataSource();

    if (dataHash.status === "deleted") {
      // TODO: Is this the best way to do this?
      SC.RunLoop.begin();
      this.pushDestroy(recordType, id);
      SC.RunLoop.end();

      dataSource.notifyDidDestroyRecord(this, recordType, dataHash, id);
      return;
    }

    var ret = sc_super();

    if (dataSource.wantsNotification) {
      dataSource.notifyDidLoadRecord(this, recordType, dataHash, id);
    }

    return ret;
  },
  
  createRecord: function(recordType, dataHash, id) {
    var ret = sc_super();
    var dataSource = this._getDataSource();

    if (dataSource.wantsNotification) {
      var primaryKey = recordType.prototype.primaryKey;
      var storeKey = ret.get('storeKey');
      id = ret.get(primaryKey);
      dataHash = this.readDataHash(storeKey);
      dataSource.notifyDidCreateRecord(this, recordType, dataHash, id);
    }

    return ret;
  }
});
