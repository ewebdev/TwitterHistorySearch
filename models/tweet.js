var mongoose = require('mongoose');

var schema = mongoose.Schema({
    id: { type: String, index: { unique: true } },
    text: String,
    timeSpan: Date,
    timeText: String,
    username: String,
    fullName: String,
    avatar: String,
    profile: String,
    userId: Number,
    terms: [String]
});

module.exports = mongoose.model('Tweet', schema);