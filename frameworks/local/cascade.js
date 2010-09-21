/*globals SCUDS */

/**
 * SCUDS.NotifyingCascadeDataSource
 *
 * @author Geoffrey Donaldson
 * @author Sean Eidemiller
 */
SCUDS.NotifyingCascadeDataSource = SC.CascadeDataSource.extend({

  /**
   * An SC.Set of data sources that want to know about record loads.
   */
  wantsNotification: SC.Set.create(),

  /**
   * Called when multiple records are loaded into the store.
   */
  notifyDidLoadRecords: function(store, recordType, dataHashes, ids) {
    var toNotify = this.wantsNotification;

    toNotify.forEach(function(source) {
      source.notifyDidLoadRecords(store, recordType, dataHashes, ids);
    });
  },

  /**
   * Called when a single record is loaded into the store.
   */
  notifyDidLoadRecord: function(store, recordType, dataHash, id) {
    var toNotify = this.wantsNotification;
    var pk;
    recordType = recordType || SC.Record;

    if (!id) {
      pk = recordType.prototype.primaryKey;
      id = dataHash[pk];
    }

    toNotify.forEach(function(source) {
      source.notifyDidLoadRecord(store, recordType, dataHash, id);
    });
  },
 
  /**
   * Called when a single record is created or updated in the store.
   */
  notifyDidWriteRecord: function(store, recordType, dataHash, id) {
    var toNotify = this.wantsNotification;
    var pk;
    recordType = recordType || SC.Record;

    if (!id) {
      pk = recordType.prototype.primaryKey;
      id = dataHash[pk];
    }

    toNotify.forEach(function(source) {
      source.notifyDidWriteRecord(store, recordType, dataHash, id);
    });
  },

  /**
   * Called when a single record is destroyed in the store.
   */
  notifyDidDestroyRecord: function(store, recordType, id) {
    var toNotify = this.wantsNotification;
    recordType = recordType || SC.Record;

    toNotify.forEach(function(source) {
      source.notifyDidDestroyRecord(store, recordType, id);
    });
  },

  from: function(dataSource) {
    var ret = sc_super();
    if (dataSource.wantsNotification) this.wantsNotification.add(dataSource);
    return ret;
  },

  forEach: function(func) {
    this.dataSources.forEach(func);
  },

  nukeLocal: function() {
    this.forEach(function(ds) {
      if (ds.nuke) ds.nuke();
    });
  },
  
  init: function() {
    sc_super();
    
    // If a dataSources array is defined, look for any that want notifcation,
    // then add them to our set.
    var sources = this.get('dataSources');
    var idx = sources ? sources.get('length') : 0;
    var source;

    while (--idx >= 0) {
      source = sources[idx];
      if (source.wantsNotification) this.wantsNotification.add(source);
    }
  }
});

