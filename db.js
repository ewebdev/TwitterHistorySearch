var mongoose = require('mongoose')
    , Models = {
        Tweet: require('./models/tweet')
    };

exports.connect = function (dbName) {
    var db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    mongoose.connect('mongodb://localhost/' + dbName);
};