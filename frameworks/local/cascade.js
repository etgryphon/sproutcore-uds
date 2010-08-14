/*globals SCUDS */

SCUDS.NotifyingCascadeDataSource = SC.CascadeDataSource.extend({

  /**
   * An SC.Set of data sources that want to know about record loads.
   */
  wantsNotification: SC.Set.create(),

  /**
   * Called when a record is loaded into the store.
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
   * Called when a record is created in the store.
   */
  notifyDidCreateRecord: function(store, recordType, dataHash, id) {
    var toNotify = this.wantsNotification;
    var pk;

    recordType = recordType || SC.Record;

    if (!id) {
      pk = recordType.prototype.primaryKey;
      id = dataHash[pk];
    }

    toNotify.forEach(function(source) {
      source.notifyDidCreateRecord(store, recordType, dataHash, id);
    });
  },

  from: function(dataSource) {
    var ret = sc_super();
    if (dataSource.wantsNotification) this.wantsNotification.add(dataSource);
    return ret;
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

