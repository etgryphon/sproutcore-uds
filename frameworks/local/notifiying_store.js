/*globals SCUDS*/

/**
 * NotifyingStore will notify the data source (usually SCUDS.NotifyingCascadeDataSource)
 * of any changes that should be bubbled through all data sources.
 *
 * @author Geoffrey Donaldson
 * @author Sean Eidemiller
 */
SCUDS.NotifyingStore = SC.Store.extend({

  /**
   * Overrides loadRecords() because we want it to invoke loadRecord() with an ignoreNotify
   * parameter.  It also notifies the data source on completion (if requested).
   *
   * For the most part, however, it does the same thing.
   */
  loadRecords: function(recordTypes, dataHashes, ids, notify) {
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

      if (!dataHash) {
        // This normally shouldn't happen, but in case it does...
        dataHashes.removeAt(idx);
        if (ids) ids.removeAt(idx);

        // Decrement the counters and continue with the loop.
        idx--;
        len--;
        continue;
      }

      if (isArray) {
        recordType = recordTypes.objectAt(idx) || SC.Record;
        primaryKey = recordType.prototype.primaryKey;
      }

      id = (ids) ? ids.objectAt(idx) : dataHash[primaryKey];
      storeKey = this.loadRecord(recordType, dataHash, id, YES);

      if (storeKey) {
        ret.push(storeKey);
      } else {
        dataHashes.removeAt(idx);
        if (ids) ids.removeAt(idx);

        // Decrement the counters.
        idx--;
        len--;
      }
    }

    // Notify the data source, but only if there actually were records to load.
    if (notify !== NO && len > 0) {
      this.notifySourcesRecordsLoaded(recordType, dataHashes, ids);
    }

    return ret;
  },
  
  notifySourcesRecordsLoaded: function(recordType, dataHashes, ids){
    var ds = this._getDataSource();

    if (ds.wantsNotification) {
      ds.notifyDidLoadRecords(this, recordType, dataHashes, ids);
    }
  },
  

  /**
   * Overrides loadRecord() to notifiy the data source on completion.
   */
  loadRecord: function(recordType, dataHash, id, ignoreNotify) {
    if (!dataHash) return null;

    if (dataHash.status === "deleted") {
      var sk = this.storeKeyExists(recordType, id);
      if (!SC.none(sk)) {
        SC.RunLoop.begin();
        this.pushDestroy(recordType, id, sk);
        SC.RunLoop.end();
      }

      return null;
    }

    var ret = sc_super();

    if (ignoreNotify !== YES) {
      var dataSource = this._getDataSource();
      if (dataSource.wantsNotification) {
        dataSource.notifyDidLoadRecord(this, recordType, dataHash, id);
      }
    }

    return ret;
  },

  /**
   * Overrides dataSourceDidComplete() to accept an optional notify parameter.
   */
  dataSourceDidComplete: function(storeKey, dataHash, newId, notify) {
    var status = this.readStatus(storeKey), K = SC.Record, statusOnly;

    if (!(status & K.BUSY) || status === K.BUSY_DESTROYING) {
      throw K.BAD_STATE_ERROR;
    } else status = K.READY_CLEAN;

    this.writeStatus(storeKey, status);
    if (newId) SC.Store.replaceIdFor(storeKey, newId);
    if (dataHash) this.writeDataHash(storeKey, dataHash, status, notify);

    statusOnly = dataHash || newId ? NO : YES;
    this.dataHashDidChange(storeKey, null, statusOnly);

    return this;
  },

  /**
   * Overrides writeDataHash() to accept an optional notify parameter and notify the data source on
   * completion if YES.
   */
  writeDataHash: function(storeKey, dataHash, status, notify) {
    var ret = sc_super();

    if (notify === YES) {
      var ds = this._getDataSource();
      if (ds.wantsNotification) {
        var id = this.idFor(storeKey);
        var recordType = this.recordTypeFor(storeKey);
        ds.notifyDidWriteRecord(this, recordType, dataHash, id);
      }
    }

    return ret;
  },

  /**
   * Overrides removeDataHash() to notify the data source on completion.
   */
  removeDataHash: function(storeKey, status) {
    var ds = this._getDataSource();

    if (ds.wantsNotification) {
      var id = this.idFor(storeKey);
      var recordType = this.recordTypeFor(storeKey);
      ds.notifyDidDestroyRecord(this, recordType, id);
    }

    return sc_super();
  }
});

