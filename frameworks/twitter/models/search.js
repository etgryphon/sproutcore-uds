// ==========================================================================
// Project: SCUDS
// Copyright: ©2009 Josh Holt, Evin Grano
// Author: Josh Holt
// ==========================================================================
/*globals escape SCUDS */
 
/** @class
 
This model represents a saved search.
 
@extends SC.Record
@version 0.1
@author Josh Holt
*/
SCUDS.TwitterSearch = SC.Record.extend(
/** @scope SCUDS.TwitterSearch.prototype */ {
  
  searchTerm: SC.Record.attr(String),
  unreadTweetsCount: SC.Record.attr(Number),
  tweets: function() {
      var query = this._query;
      var searchTerm = this.get('searchTerm');
      if (!query && searchTerm) {
        query = this._query = SC.Query.local(SCUDS.Tweet, {
              conditions: "searchTerm = {searchterm}",
              orderBy: 'id DESC',
              parameters: {searchterm: searchTerm},
              url: 'search.json?rpp=10&q=%@'.fmt(escape(searchTerm)) });
      }
 
      return this.get('store').find(query);
   }.property().cacheable()
 
}) ;