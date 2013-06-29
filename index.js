var BufferGroup = require('buffer-group'),
    OffsetBuffer = require('offset-buffer'),
    debug = false,
    events = require('events'),
    util = require('util');

module.exports = require('./framing-buffer.js')(
    OffsetBuffer,
    BufferGroup,
    debug,
    events,
    util,
    console
);