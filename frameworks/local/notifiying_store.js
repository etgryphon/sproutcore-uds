/**
 * NotifyingStore will notify the data source (usually SCUDS.NotifyingCascadeDataSource)
 * of any changes that should be bubbled through all data sources.
 *
 * @author Geoffrey Donaldson
 * @author Sean Eidemiller
 */
SCUDS.NotifyingStore = SC.Store.extend({

  /**
   * A hash of timestamps for the lastRetrievedAt time for each record type.
   */
  lastRetrievedAt: {},

  /**
   * Overrides loadRecords() because we want it to invoke loadRecord() with an ignoreNotify
   * parameter.  It also notifies the data source on completion.
   *
   * For the most part, however, it does the same thing.
   */
  loadRecords: function(recordTypes, dataHashes, ids) {
    var isArray = SC.typeOf(recordTypes) === SC.T_ARRAY;
    var len = dataHashes.get('length');
    var ret = [];
    var K = SC.Record;
    var recordType, id, primaryKey, idx, dataHash, storeKey;

    // Save lookup info.
    if (!isArray) {
      recordType = recordTypes || SC.Record;
      primaryKey = recordType.prototype.primaryKey;
    }

    // Load each record individually.
    for (idx = 0; idx < len; idx++) {
      dataHash = dataHashes.objectAt(idx);
      if (isArray) {
        recordType = recordTypes.objectAt(idx) || SC.Record;
        primaryKey = recordType.prototype.primaryKey;
      }

      id = (ids) ? ids.objectAt(idx) : dataHash[primaryKey];
      storeKey = this.loadRecord(recordType, dataHash, id, YES);
      if (storeKey) ret.push(storeKey);
    }

    var ds = this._getDataSource();

    if (ds.wantsNotification) {
      ds.notifyDidLoadRecords(this, recordType, dataHashes, ids);
    }

    return ret;
  },

  /**
   * Overrides loadRecord() to notifiy the data source on completion.
   */
  loadRecord: function(recordType, dataHash, id, ignoreNotify) {
    var dataSource = this._getDataSource();

    if (dataHash.status === "deleted") {
      // TODO: Is this the best way to do this?
      SC.RunLoop.begin();
      this.pushDestroy(recordType, id);
      SC.RunLoop.end();

      dataSource.notifyDidDestroyRecord(this, recordType, dataHash, id);
      return null;
    }

    var ret = sc_super();

    if (ignoreNotify !== YES && dataSource.wantsNotification) {
      dataSource.notifyDidLoadRecord(this, recordType, dataHash, id);
    }

    return ret;
  },

  /**
   * Overrides createRecord() to notify the data source on completion.
   */
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

