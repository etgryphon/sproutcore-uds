/**
 * SCUDS. LocalDataSource Unit Test
 *
 * @author Geoffrey Donaldson
 */
/*globals module ok equals same test MyApp SCUDS Lawnchair*/

(function() {
  var AB = SC.Object.create(), storageMethod = 'webkit', // Make this variable
    store, dataSource, child, storeKey, json, local, mockSource,
    didFetchCallCount, storePushCount,
  hash = {
    id: 1,
    type: 'person',
    name: "Person One",
    depth: 'minimal',
    updatedAt: new Date().getTime()
  } ;
    
  mockSource = SC.DataSource.extend({
    fetch: function(store, query) {
      var recordType = query.get('recordType'),
          records = [hash];
      console.log('mockSource.fetch') ;
      store.loadRecords(recordType, records);
      store.dataSourceDidFetchQuery(query);
    }
  }) ;
  
  local = SCUDS.LocalDataSource.create({
    isTesting: YES,
    _didFetch: function() {
      console.log('LocalDataSource._didFetch called') ;
      didFetchCallCount += 1 ;
      sc_super();
    }
  });
  
  storageMethod = local.get('storageMethod') ;
  
  module("SCUDS. LocalDataSource", {
    setup: function() {
      store = SC.Store.create({
        
      });
      dataSource = SCUDS.NotifyingCascadeDataSource.create() ;
      dataSource.from(local)
        .from(mockSource.create());

      store.set('dataSource', dataSource) ;
      
      AB.set('store', store) ;
      
      AB.Person = SC.Record.extend({
        primaryKey: "id",
        id: SC.Record.attr(Number),
        name: SC.Record.attr(String)
      }) ;
      AB.Person.mixin({
        toString: function() {
          return 'AB.Person' ;
        }
      }) ;
      
      didFetchCallCount = storePushCount = 0 ;
      
      local.nuke(AB.Person) ;
      console.log(AB.Person.toString());
      SC.RunLoop.begin() ;
    },
    
    teardown: function() {
      SC.RunLoop.end() ;
    }
  });
  
  test("fetch Data saves into LocalStorage", function(){
    console.log('TEST 1');
    var S = AB.store,
        ds = new Lawnchair({table:'ABPerson', adaptor: storageMethod});
    
    S.find(SC.Query.local(AB.Person)) ;
    
    SC.RunLoop.begin() ;
    S.invokeLater(function(){
      ds.get('person-1', function(o) {
        SC.RunLoop.begin() ;
        // if ()
        // console.log('We got the data') ;
        console.log(o) ;
        ok(o, "Should be able to retrieve record") ;
        if (o) {
          equals(o.record.name, hash.name, 'Result from DB should equal data put in') ;
        }
        start() ;
        SC.RunLoop.end() ;
      }) ;
    }, 100 ) ;  
    SC.RunLoop.end() ;
    
    stop() ;
    
  }) ;
  
  test("fetch should populate SC.store with data from localStore", function(){
    console.log('TEST 2');
    var S = AB.store,
        ds = new Lawnchair({table:'ABPerson', adaptor: storageMethod}),
        hash2 = {
          key: 'person-2',
          record: {
            id: 2,
            type: 'person',
            name: "Person Two",
            depth: 'minimal'
          }
        } ;
    ds.save(hash2, function(o) {
      var people = S.find(SC.Query.local(AB.Person)) ;
      SC.RunLoop.begin() ;
      S.invokeLater(function(){
        SC.RunLoop.begin() ;
        equals(didFetchCallCount, 1, "_didFetch should have been called") ;
        equals(people.get('length'), 2, "Should have 2 records in SC.Store") ;
        equals(people.objectAt(0).get('name'), 'Person One') ;
        equals(people.objectAt(1).get('name'), 'Person Two') ;
        start() ;
        SC.RunLoop.end() ;
      }, 100) ;
     SC.RunLoop.end() ;
    }) ;
    
    stop() ;
    
  }) ;
  
  test("fetch should merge in changed fields from fetched minimal to stored complete", function(){
    console.log('TEST 3');
    var S = AB.store,
        ds = new Lawnchair({table:'ABPerson', adaptor: storageMethod}),
        hash2 = {
          key: 'person-1',
          record: {
            id: 1,
            type: 'person',
            name: "Person 1",
            depth: 'complete',
            age: 25,
            updatedAt: new Date().getTime() - 10000
          }
        } ;
    ds.save(hash2, function(o) {
      var people = S.find(SC.Query.local(AB.Person)) ;
      
      SC.RunLoop.begin() ;
      S.invokeLater(function(){
        SC.RunLoop.begin() ;
        equals(people.get('length'), 1, "Should have 1 record in SC.Store") ;
        equals(people.objectAt(0).get('age'), 25, "Age should come from existing complete") ;
        equals(people.objectAt(0).get('name'), 'Person One', "Name should come from downloaded minimal") ;
        start() ;
        
        ds.get(hash2.key, function(o) {
          SC.RunLoop.begin() ;
          equals(o.record.age, 25) ;
          equals(o.record.name, 'Person One') ;
          equals(o.record.depth, 'complete') ;
          start() ;
          SC.RunLoop.end() ;
        }) ;
        
        stop() ;
        SC.RunLoop.end() ;
      }, 100) ;
     SC.RunLoop.end() ;
    }) ;
    
    stop() ;
    
  }) ;
  
  // test("Should save lots of data", function() {
  //   console.log('TEST 4') ;
  //   var S = AB.store,
  //       ds = new Lawnchair({table:'ABPerson', adaptor: storageMethod}),
  //       count = 0,
  //       go = true ;
  //       hash2 = {
  //         key: 'person-1',
  //         record: {
  //           id: 1,
  //           type: 'person',
  //           name: "Person 1",
  //           depth: 'complete',
  //           age: 25,
  //           updatedAt: new Date().getTime() - 10000
  //         }
  //       } ;
  //   while (go) {
  //     try {
  //       ds.save(hash2) ;
  //       count += 1 ;
  //     } catch(e) {
  //       go = false ;
  //     }
  //   }
  //   console.log(count) ;
  //   ok(count, 'count should be positive') ;
  // }) ;
  
})();

