/*globals SCUDS */

/**
  @author Colin Campbell (colin@strobecorp.com)
*/
SCUDS.SQLiteStorageAdaptor = SC.Object.extend({

  // ..........................................................
  // Properties
  // 
  
  /**
    The LocalDataSource to notify once records have been
    fetched, updated, deleted, etc.
    
    @property {SCUDS.LocalDataSource}
    @default null
  */
  dataSource: null,
  
  /**
    Unique idenitify on the record usually id or guid
    
    @property {String}
    @default 'id'
  */
  primaryKey: 'id',
  
  /**
    The record type you're storing with this adaptor
    
    @property {SC.Record}
    @default null
  */
  recordType: null,
  
  /**
    The table name to store the record type in
    
    @property {String}
    @default null
  */
  tableName: null,
  
  /**
    @property {Boolean}
    @default NO
  */
  shouldBenchmark: NO,
  
  
  // ..........................................................
  // Database Support
  // 
  
  
  /**
    Creates the database, if needed, and then creates a table
    for this adaptor based on the provided tableName property
  */
  init: function() {
    sc_super();
    
    var tableName = this.get('tableName'),
        db = SCUDS.SQLiteStorageAdaptor.getDatabase(),
        that = this;
    
    tableName = tableName.replace(/\./g, '');
    this.set('tableName', tableName);
    
    if (!tableName) {
      SC.Logger.warn('No tableName provided!');
      return;
    }
    if (!db) {
      SC.Logger.warn('Database could not be found/generated on SCUDS.SQLiteStorageAdaptor, are you sure this browser supports it?');
      return;
    }
    
    db.transaction(function(t) {
      t.executeSql(
        'CREATE TABLE IF NOT EXISTS ' + tableName + ' (id STRING NOT NULL PRIMARY KEY, value BLOB NOT NULL);',
        [],
        function() {},
        that._errorHandler
      );
    }, function(error) { that._transactionErrorHandler.call(that, error, "create table"); });
  },
  
  /**
    @param {Hash|String} id The id of the record to obtain
    @param {Function} callback An optional callback
    @returns The hash of the record
  */
  getHash: function(hashOrId, callback) {
    var db = SCUDS.SQLiteStorageAdaptor.getDatabase(),
        tableName = this.get('tableName'),
        primaryKey = this.get('primaryKey'),
        that = this, o, searchId;
    
    if (callback === undefined) callback = this._didGetHash;
    
    if (typeof hashOrId === SC.T_OBJECT) searchId = hashOrId[primaryKey];
    else searchId = hashOrId;
    
    if (db) {
      db.transaction(function(t) {
        t.executeSql(
          'SELECT value FROM ' + tableName + ' WHERE id = ?;',
          [searchId],
          function(transaction, results) {
            o = null;
            if (results.rows.length > 0) {
              o = that._deserializeHash(results.rows.item(0).value);
              o[primaryKey] = searchId; // ensure hash is normalized
            }
            callback.call(that, o, hashOrId);
          },
          that._errorHandler
        );
      }, function(error) { that._transactionErrorHandler.call(that, error, "getHash"); });
      
      return YES;
    }
    
    return NO;
  },
  
  /** @private
    Called once a hash has been fetched from the database
  */
  _didGetHash: function(hash) {
    var dataSource = this.get('dataSource');
    if (dataSource && typeof dataSource.dataStoreDidGetHash === SC.T_FUNCTION) {
      SC.RunLoop.begin();
      dataSource.dataStoreDidGetHash(this.get('recordType'), hash);
      SC.RunLoop.end();
    }
  },
  
  /**
    
  */
  getAll: function(store, query, callback) {
    var db = SCUDS.SQLiteStorageAdaptor.getDatabase(),
        tableName = this.get('tableName'),
        that = this,
        idx, len, ret = [], hash;
    
    if (callback === undefined) callback = this._didGetAll;
    
    if (db) {
      db.transaction(function(t) {
        t.executeSql(
          'SELECT * FROM ' + tableName + ';',
          [],
          function(transaction, result) {
            len = result.rows.length;
            for (idx = 0; idx < len; idx++) {
              hash = that._deserializeHash(result.rows.item(idx).value);
              ret.push(hash);
            }
            callback.call(that, ret, store, query);
          },
          that._errorHandler
        );
      }, function(error) { that._transactionErrorHandler.call(that, error, "getAll", tableName); });
      
      return YES;
    }
    
    return NO;
  },
  
  /** @private
    Called once the hashes have been fetched from the database
  */
  _didGetAll: function(hashes, store, query) {
    var dataSource = this.get('dataSource');
    if (dataSource && typeof dataSource.dataStoreDidGetHashes === SC.T_FUNCTION) {
      SC.RunLoop.begin();
      dataSource.dataStoreDidGetHashes(hashes, store, query);
      SC.RunLoop.end();
    }
  },
  
  /**
    @param {Hash} hash The hash to insert
    @returns YES if transaction executed, NO otherwise
  */
  insert: function(hash, callback) {
    var db = SCUDS.SQLiteStorageAdaptor.getDatabase(),
        tableName = this.get('tableName'),
        primaryKey = this.get('primaryKey'),
        that = this, o;
    
    if (callback === undefined) callback = this._didInsert;
    
    if (db) {
      db.transaction(function(t) {
        t.executeSql(
          'INSERT INTO ' + tableName + '(id, value) VALUES(?, ?);',
          [String(hash[primaryKey]), that._serializeHash(hash)],
          function() {
            callback.call(that, hash);
          },
          that._errorHandler
        );
      }, function(error) { that._transactionErrorHandler.call(that, error, "insert"); });
      
      return YES;
    }
    
    return NO;
  },
  
  _didInsert: function(hash) {
    var dataSource = this.get('dataSource');
    if (dataSource && typeof dataSource.dataStoreDidInsertHash === SC.T_FUNCTION) {
      dataSource.dataStoreDidInsertHash(this.get('recordType'), hash);
    }
  },
  
  /**
    Saves a hash, or array of hashes, to the database.
    Calls update or insert, depending on if the ID
    exists in the database already.
    
    @param {Hash|Array} hashes the hash(es) to save
    @returns YES if saved, NO otherwise
  */
  save: function(hashes, store, id) {
    var db = SCUDS.SQLiteStorageAdaptor.getDatabase(),
        tableName = this.get('tableName'),
        primaryKey = this.get('primaryKey'),
        that = this,
        idx, len, hash, id, callback;
    
    if (!db) return NO;
    if (!SC.isArray(hashes)) hashes = [hashes];
    
    callback = this._didSave;
    
    db.transaction(function(t) {
      len = hashes.get('length');
      for (idx = 0; idx < len; idx++) {
        hash = hashes[idx];
        t.executeSql(
          'REPLACE INTO ' + tableName + '(id, value) VALUES(?, ?);',
          [String(hash[primaryKey]), that._serializeHash(hash)],
          function(transaction, result) {
            /*
              FIXME hash is actually the last hash in the list... fail
                      we can't really inline this, we should use notification
            */
            callback.call(that, hash, store, id);
          },
          that._errorHandler
        );
      }
    }, function(error) { that._transactionErrorHandler.call(that, error, "save"); });
    
    return YES;
  },

  _didSave: function(hash, store, id) {

    var dataSource = this.get('dataSource'),
        recordType = this.get('recordType'),
        storeKey = store.storeKeyExists(recordType, id);
    if (dataSource && typeof dataSource.dataStoreDidSaveHash === SC.T_FUNCTION && store && storeKey) {
      dataSource.dataStoreDidSaveHash(hash, store, storeKey);
    }
  },
  
  /**
    @param {Hash} hash The hash to update
    @returns YES if transaction executed, NO otherwise
  */
  update: function(hash, callback) {
    var db = SCUDS.SQLiteStorageAdaptor.getDatabase(),
        tableName = this.get('tableName'),
        primaryKey = this.get('primaryKey'),
        that = this, o;
    
    if (callback === undefined) callback = this._didUpdate;
    
    if (db) {
      db.transaction(function(t) {
        t.executeSql(
          'UPDATE ' + tableName + ' SET value = ? WHERE id = ?;',
          [that._serializeHash(hash), String(hash[primaryKey])],
          function() {
            callback.call(that, hash);
          },
          that._errorHandler
        );
      }, function(error) { that._transactionErrorHandler.call(that, error, "update"); });
      
      return YES;
    }
    
    return NO;
  },
  
  _didUpdate: function(hash) {
    var dataSource = this.get('dataSource');
    if (dataSource && typeof dataSource.dataStoreDidUpdateHash === SC.T_FUNCTION) {
      dataSource.dataStoreDidUpdateHash(this.get('recordType'), hash);
    }
  },
  
  /**
    Removes a hash from the database
    
    @param {Hash|String} hashOrId The hash or id (of the hash) to remove
    @param {SC.Store} store The store the record is in
    @param {String} storeKey The storeKey of the record
    @returns YES if removed, NO otherwise
  */
  remove: function(hashOrId, store) {
    var db = SCUDS.SQLiteStorageAdaptor.getDatabase(),
        tableName = this.get('tableName'),
        that = this,
        id;
    
    if (typeof hashOrId === SC.T_OBJECT) {
      id = hashOrId[this.get('primaryKey')];
    } else {
      id = hashOrId;
    }
    
    if (db) {
      db.transaction(function(t) {
        t.executeSql(
          'DELETE FROM ' + tableName + ' WHERE id = ?;',
          [String(id)],
          function() {
            that._didRemove.call(that, store,  id);
          },
          that._errorHandler
        );
      }, function(error) { that._transactionErrorHandler.call(that, error, "remove"); });
      
      return YES;
    }
    
    return NO;
  },
  
  _didRemove: function(store, id) {
    var dataSource = this.get('dataSource'),
        recordType = this.get('recordType'),
        storeKey = store.storeKeyExists(recordType, id);
    if (dataSource && typeof dataSource.dataStoreDidRemoveRecord === SC.T_FUNCTION) {
      dataSource.dataStoreDidRemoveRecord(store, storeKey, id);
    }
  },
  
  /**
    Removes all the hashes for the record type
    
    @returns YES if nuked, NO otherwise
  */
  nuke: function() {
    var db = SCUDS.SQLiteStorageAdaptor.getDatabase(),
        tableName = this.get('tableName'),
        that = this, o;
    
    if (db) {
      db.transaction(function(t) {
        t.executeSql(
          'DROP TABLE "' + tableName + '"',
          [],
          function() {},
          that._errorHandler
        );
      }, this._transactionErrorHandler);
      
      return YES;
    }
    
    return NO;
  },
  
  
  // ..........................................................
  // Internal Support
  // 
  
  _errorHandler: function(transaction, error) {
    SC.Logger.log('Transaction error: %@ (code %@)'.fmt(error.message, error.code));
    return false;
  },
  
  _transactionErrorHandler: function(error, action, tableName) {
    SC.Logger.log("I can haz error during %@ on %@?".fmt(action, tableName), error.message, error.code);
  },
  
  _deserializeHash: function(str){
    if(this.shouldBenchmark) SC.Benchmark.start('webkitAccess');
    var results;
    try {
      results = SC.json.decode(str) || {};
    } catch(e) {
      console.warn('Error during deserialization of records; clearing the cache.');
      this.nuke();
      results = {};
    }
    if(this.shouldBenchmark) SC.Benchmark.end('webkitAccess');
    return results;
  },
  
  //TODO: to make this faster...
  // •compress data
  // •put writes into pages
  // •only write onece per browser session (at window close)
  _serializeHash: function(data){
    if(this.shouldBenchmark) SC.Benchmark.start('encodingData');
    var str = SC.json.encode(data);
    if(this.shouldBenchmark) SC.Benchmark.end('encodingData');
    return str;
  }

});


SCUDS.SQLiteStorageAdaptor.mixin({

  _db: null,
  
  getDatabase: function() {
    if (SCUDS.SQLiteStorageAdaptor._db) return SCUDS.SQLiteStorageAdaptor._db;
    
    try {
      if (!window.openDatabase) {
        return null;
      } else {
        SCUDS.SQLiteStorageAdaptor._db = window.openDatabase('SCUDS', '0.1', 'SCUDS', 2000000);
        return SCUDS.SQLiteStorageAdaptor._db;
      }
    } catch (e) {
      alert("Unknown error "+e+".");
      return;
    }
  }

}) ;
