var https = require('https')
    , fs = require('fs')
    , cheerio = require('cheerio')
    , Q = require('q');


var Tweet = require('./models/tweet');

var Fetcher = function (q, notJustTop) {

    var scope = this;
    this.q = q;
    this.notJustTop = !!notJustTop;
    var allTweets = [];

    var requestTweets = function (params) {
        var deferred = Q.defer();

        var qUrl = "https://twitter.com/search" + (scope.notJustTop ? "/realtime" : "") + "?&src=typd&q=" + q + '%20' + encodeURIComponent(scope._paramsToString(params));
        console.log(qUrl);

        https.get(qUrl,function (res) {
//        console.log('STATUS: ' + res.statusCode);
//        console.log('HEADERS: ' + JSON.stringify(res.headers));
            res.setEncoding('utf8');

            var data = '';
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function () {
                var tweets = scope._parseTweets(data);
                if (params.max_id && tweets.items.length) {
                    tweets.items.shift();
                }
                tweets.length = tweets.items.length;
                deferred.resolve(tweets);
            });
        }).
            on('error', function (e) {
                deferred.reject(e);
            });

        return deferred.promise;
    };

    var searchUntilId = function (id) {
        return requestTweets({max_id: id});
    };

    var searchUntilDate = function (day, month, year /* OR [q, until] */) {
        var until;
        if (arguments.length === 1) {
            if (day instanceof Date) {
                until = scope._toQueryDateString(day.getDate(), day.getMonth() + 1, day.getYear());
            } else { //string
                until = day;
            }
        } else {
            until = scope._toQueryDateString(day, month, year);
        }

        return requestTweets({until: until});
    };


    var handleHistoryTweets = function (tweets) {
        //deferred = deferred || Q.defer();
//        allTweets = allTweets || [];

        var tweetId = tweets.length ? tweets.items[tweets.length - 1].id : -1;
//    console.log(tweets.items.map(function (t) {
//        return t.timeText + '   ' + t.id + '   @' + t.username;
//    }).join('\n') + '\n');

        Array.prototype.push.apply(allTweets, tweets.items);
//    console.log('notify ' + allTweets.length);
        scope.deferred.notify({current: tweets, all: allTweets, deferred: scope.deferred});

        if (!tweets.last) {
            searchUntilId(tweetId)
                .then(function (prevTweets) {
                    handleHistoryTweets(prevTweets);
                }, function (error) {
                    scope.deferred.reject(error);
                });
        }

        return scope.deferred;
    };

    var fetchRecursive = function (day, month, year) {
//        if (arguments.length < 4) {
//            var now = new Date();
//            day = now.getDate();
//            month = now.getMonth() + 1;
//            year = 1900 + now.getYear();
//        }

        searchUntilDate(day, month, year)
            .then(function (tweets) {
                return handleHistoryTweets(tweets);
            });

        return scope.deferred.promise;
    };

    var fetch = function (day, month, year) {
        scope.deferred = Q.defer();

        if (arguments.length < 5) {
            var now;
            if (day instanceof Date) {
                now = day;
            } else {
                now = new Date()
            }
            scope.initDate = now;
            day = now.getDate();
            month = now.getMonth() + 1;
            year = 1900 + now.getYear();
        } else {
            scope.initDate = new Date(year, month, day);
        }

        return fetchRecursive(day, month, year)
            .then(function () {
                console.log('completed [' + q + ']: ' + allTweets.length + ' tweets' + (allTweets.length ? ', since ' + allTweets[allTweets.length - 1].timeText : ''));

                if (allTweets.length > 0) {

                    var output = {
                        q: q,
                        until: [day, month, year].join('/'),
                        length: allTweets.length,
                        items: allTweets
                    };

                    var outputFilename = './data/' + q.replace(/[\|&;\$%@"*<>\(\)\+,]/g, "").toLowerCase() + (notJustTop ? '_realtime' : '_top') + '.json';
                    fs.writeFile(outputFilename, JSON.stringify(output, null, 4), function (err) {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log("saved to " + outputFilename);
                        }
                    });
                }

            }, function (error) {

            }, function (progress) {
//            console.log('new: ' + progress.current.length);


                progress.current.items.forEach(function (tweet) {
                    Tweet.findOne({id: tweet.id}, function (err, doc) {
                        if (doc) {
                            if (doc.terms.indexOf(q) === -1) {
                                doc.terms.push(q);
                                doc.save(function (err) {
                                    if (err) {
                                        console.log('error saving tweet', err)
                                    }
                                });
                            }
                        } else {
                            tweet.terms = [q];
                            new Tweet(tweet).save(function (err) {
                                if (err) {
                                    console.log('error saving tweet', err)
                                }
                            });
                        }
                    });
                });


                if (progress.current.last) {
                    if (allTweets.length) {
                        var lastTweetTime = allTweets[allTweets.length - 1].timeSpan;
                        Tweet.find({ terms: q, timeSpan: {$lt: lastTweetTime} }, function (err, tweets) {
                            if (lastTweetTime < scope.initDate.getTime() && tweets.length) {
//                        console.log(tweets[0]);
                                console.log('not finished!');

                                if (notJustTop) {
//                            console.log('attempts: ' + (++attempts));
                                    fetch(new Date(lastTweetTime));
                                }
                            } else {
                                scope.deferred.resolve(allTweets);
                            }
                        });
                    } else {
                        scope.deferred.resolve(allTweets);
                    }
                }


                if (!progress.current.last) {
                    console.log('progress [' + q + ']: ' + allTweets.length + ' tweets, since ' + allTweets[allTweets.length - 1].timeText);
                }
            });


    };


    this.fetch = fetch;

    return this;
};


Fetcher.prototype._parseTweets = function (data) {
    var html = data;
    var $ = cheerio.load(html);
    var tweets = $('.original-tweet').map(function () {
        var $tweet = $(this),
            dateTime = $tweet.find('.js-short-timestamp').attr('data-time') * 1000;
        return {
            id: $tweet.attr('data-item-id').trim(),
            text: $tweet.find('.tweet-text').text().trim(),
            timeSpan: dateTime,
            timeText: new Date(dateTime).toString(),
            username: $tweet.find('.js-action-profile-name.username b').text().trim(),
            fullName: $tweet.find('.js-action-profile-name.fullname').text().trim(),
            avatar: $tweet.find('.js-action-profile-avatar').attr('src').trim(),
            profile: $tweet.find('.js-user-profile-link').attr('href').trim(),
            userId: $tweet.attr('data-user-id').trim()
        };
    });
    return {
        items: tweets,
        last: tweets.length === 0 || !$('.timeline-end').hasClass('has-more-items')
    };
};

Fetcher.prototype._toQueryDateString = function (day, month, year) {
    var to2Digits = function (n) {
        return (n < 10 ? '0' : '') + n;
    };
    var to4DigitsYear = function (n) {
        n = Number(n);
        return ((n < 1900 ? 1900 : 0) + n) + '';
    };
    return [to4DigitsYear(year), to2Digits(month), to2Digits(day)].join('-');
};

Fetcher.prototype._paramsToString = function (params) {
    return Object.keys(params).map(function (key) {
        return key + ':' + params[key]
    }).join(' ');
};


module.exports = Fetcher;