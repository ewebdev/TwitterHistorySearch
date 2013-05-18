var https = require('https')
    , fs = require('fs')
    , cheerio = require('cheerio')
    , Q = require('q');

require('./db').connect('trends');

var TweetsHistoryFetcher = require('./tweetsHistoryFetcher');

new TweetsHistoryFetcher('node.js', true).fetch()
    .then(function(){
//       console.log('done');
    });
