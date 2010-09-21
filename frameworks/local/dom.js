/*globals SCUDS*/

/** @class
  
  Little wrapper for DOM storage
  @extends SC.Object
  @author Mike Ball
  @version 0.1
*/
SCUDS.DOMStorageAdapter = SC.Object.extend(
/** @scope SCUDS.DOMStorageAdapter.prototype */{
  
  //usually the record type
  localStorageKey: '',
  
  //unique idenitify on the record usually id or guid
  contentItemKey: 'id',
  
  shouldBenchmark: NO,
  
  _deserializeHash: function(){
    if(this.shouldBenchmark) SC.Benchmark.start('domAccess');
    var key = this.localStorageKey, results;
    try {
      results = SC.json.decode(window.localStorage.getItem(key)) || {};
    } catch(e) {
      console.warn('Error during deserialization of records; clearing the cache.');
      this.nuke();
      results = {};
    }
    if(this.shouldBenchmark) SC.Benchmark.end('domAccess');
    return results;
  },
  
  
  _deserializeAsArray: function(){
    if(this.shouldBenchmark) SC.Benchmark.start('arrayAccess');
    var key = this.localStorageKey, results;
    try {
      var data = window.localStorage.getItem(key);
      data = data.replace(/\"[0-9]+\":/gi,''); //turn it into an array reduce lines for ie...
      results = SC.json.decode('['+data.substring(1,data.length-1)+']') || [];
    } catch(e) {
      console.warn('Error during deserialization of records; clearing the cache.');
      this.nuke();
      results = [];
    }
    if(this.shouldBenchmark) SC.Benchmark.end('arrayAccess');
    return results;
  },
  //TODO: to make this faster...
  // •compress data
  // •put writes into pages
  // •only write onece per browser session (at window close)
  _serializeHash: function(data){
    if(this.shouldBenchmark) SC.Benchmark.start('encodingData');
    var ret = window.localStorage.setItem(this.localStorageKey, SC.json.encode(data));
    if(this.shouldBenchmark) SC.Benchmark.end('encodingData');
    return ret;
  },
  

  /**
   Writes a single record or an array of records to the local storage.
   
   @returns YES|NO depending on success
  */
  save: function(obj) {
    if (obj instanceof Array) {
      // Got an array of objects.
      return this._saveAll(obj);
    }
    
    var key = obj[this.contentItemKey];
    
    if(key){
      var data = this._deserializeHash();
      data[key] = obj;
      this._serializeHash(data);
      return YES;
    }
    else{
      //unable to save data
      return NO;
    }
  },

  /**
   * Writes multiple records to the local storage.
   */
  _saveAll: function(array) {
    var data = this._deserializeHash();
    var length = array.length;
    
    if(length > 10 && SC.browser.msie){ //only do this for msie
      var startIndex = 0, that = this;
      this.invokeLater(function(){
        that._chunkSave(data, array, startIndex, length);
      });
    }
    else{
      for (var i = 0; i < length; i++) {
        data[array[i][this.contentItemKey]] = array[i]; //TODO: optimize ie perf
      }
      this._serializeHash(data);
    }
  },
  
  _chunkSave: function(data, array, startIndex, length){
    var i;
    startIndex+=10;
    if(startIndex < length){
      for(i = startIndex-10; i < startIndex; i++){
        data[array[i][this.contentItemKey]] = array[i]; 
      }
      var that = this;
      this.invokeLater(function(){
        that._chunkSave(data,array,startIndex,length);
      },5);
    }
    else{
      for(i = startIndex-10; i < length; i++){
        data[array[i][this.contentItemKey]] = array[i]; 
      }
      this._serializeHash(data);
    }    
  },

  /**
   Reads a single record from the local storage.
  */
  get: function(id) {
    var data = this._deserializeHash();
    var rec = data[id];

    return rec ? rec : null;
  },

  /**
    Reads all of the records in this table from the local storage.
  */
  getAll: function() {
    return this._deserializeAsArray();
  },

  /**
    Removes a single record from the local storage.
  */
  remove: function(id) {
    var data = this._deserializeHash();
    delete data[id];
    
    this._serializeHash(data);
  },

  /**
    Removes all data associated with this table from the local storage.
  */
  nuke: function() {
    window.localStorage.removeItem(this.localStorageKey);

  }
  
  
  
});