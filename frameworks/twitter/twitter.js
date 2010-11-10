// ==========================================================================
// Project:   SCUDS
// Copyright: ©2009 (MRD)
// Author: Josh Holt
// ==========================================================================
/*globals unescape SCUDS */


/**

  This data source will fetch tweets from Twitter's search service.
  
  -- Currently it is setup to only fetch 10 at a time
    -- you can change this by specifying a number in the range on twitter's 
      search API wiki. {{{ rpp=<your number here>  }}}
      
  An example query:
  {{{
    sc_require('models/tweet');
    YourApp.TWEETS_QUERY = SC.Query.local(SCUDS.Tweet, { orderBy: 'id DESC', url: 'search.json?rpp=10&q=twitter' });
  }}}
  
  You would place the query and requires at the top of this file, main.js, or
  core.js

*/

/** @class

  (Document Your Data Source Here)

  @extends SC.DataSource
*/
SCUDS.TwitterDataSource = SC.DataSource.extend(
/** @scope SCUDS.TwitterDataSource.prototype */ {

  // ..........................................................
  // QUERY SUPPORT
  // 

  fetch: function(store, query) {
    var url = query.get('url');
    if (url) {
      SC.Request.getUrl(url).json()
            .notify(this, 'didFetchTweets', store, query)
            .send();
          return YES;
    }
    return NO;
  },
  
  didFetchTweets: function(response, store, query) {
    if (SC.ok(response)) {
      var recs = response.get('body').results;
      if (recs) {
        for (var i=0; i < recs.length; i++) {
          recs[i].guid = recs.length - i;
          recs[i].searchTerm = unescape(response.get('body').query);
          recs[i].text = recs[i].text.unescapeHTML();
        }
        store.loadRecords(SCUDS.Tweet, recs);
        store.dataSourceDidFetchQuery(query);
      } else {
        store.dataSourceDidErrorQuery(query, response);
      }
    } else store.dataSourceDidErrorQuery(query, response);
  },

  // ..........................................................
  // RECORD SUPPORT
  // 
  
  retrieveRecord: function(store, storeKey) {
    
    // TODO: [EG] Add handlers to retrieve an individual record's contents
    // call store.dataSourceDidComplete(storeKey) when done.
    
    return NO ; // return YES if you handled the storeKey
  },
  
  createRecord: function(store, storeKey) {
    var newId = store.find(SCUDS.TwitterSearch).length();
    var datahash = store.readEditableDataHash(storeKey);
    datahash.guid = newId + 1;
    store.dataSourceDidComplete(storeKey,null,newId + 1);
    return YES;
  },
  
  updateRecord: function(store, storeKey) {
    
    // TODO: [EG] Add handlers to submit modified record to the data source
    // call store.dataSourceDidComplete(storeKey) when done.

    return NO ; // return YES if you handled the storeKey
  },
  
  destroyRecord: function(store, storeKey) {
    
    // TODO: [EG] Add handlers to destroy records on the data source.
    // call store.dataSourceDidDestroy(storeKey) when done
    
    return NO ; // return YES if you handled the storeKey
  }
  
}) ;

