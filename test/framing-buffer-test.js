var test = require('tap').test,
    util = require('util'),
    events = require('events'),
    debug = true,
    OffsetBuffer = require('offset-buffer'),
    BufferGroup = require('buffer-group'),
    FramingBuffer = require('../framing-buffer.js')(
        OffsetBuffer,
        BufferGroup,
        debug,
        events,
        util,
        console
    );

process.on('uncaughtException', function(err) {
    console.log('Uncaught exception: ' + err);
    process.exit(-1);
});


test('push()', function(t) {
    t.test('Full key and full data.  Exact size.', function(t) {
        var fb = new FramingBuffer(),
            data_frame,
            expected;

        data_frame = new OffsetBuffer(4 + 4);
        data_frame.writeInt32BE(4); // length
        data_frame.writeInt32BE(100); // some data
        expected = data_frame.buf.slice(4);
        fb.on('frame', function(frame) {
            t.ok(buffer_equal(frame.buf, expected), 'Returned frame matched expected frame');
            t.end();
        });
        fb.push(data_frame.buf);
    });
    t.test('Full key and then data in 2 parts.', function(t) {
        var fb = new FramingBuffer(),
            data_frame1,
            data_frame2,
            expected;

        data_frame1 = new OffsetBuffer(4 + 4);
        data_frame1.writeInt32BE(8); // length
        data_frame1.writeInt32BE(12345); // data part 1
        data_frame2 = new OffsetBuffer(4);
        data_frame2.writeInt32BE(54321); // data part 2
        expected = Buffer.concat([data_frame1.buf.slice(4), data_frame2.buf]);
        fb.on('frame', function(frame) {
            t.ok(buffer_equal(frame.buf, expected), 'Returned frame matched the expected frame');
            t.end();
        });
        fb.push(data_frame1.buf);
        fb.push(data_frame2.buf);
    });
    t.test('Key in 2 parts where second has full data.', function(t) {
        var fb = new FramingBuffer(),
            data_frame1,
            data_frame2,
            expected;

        data_frame1 = new OffsetBuffer(2);
        data_frame1.writeInt16BE(0); // length part 1
        data_frame2 = new OffsetBuffer(10);
        data_frame2.writeInt16BE(8); // length part 2
        data_frame2.writeInt32BE(54321); // data part 1
        data_frame2.writeInt32BE(12345); // data part 2
        expected = data_frame2.buf.slice(2);
        fb.on('frame', function(frame) {
            t.ok(buffer_equal(frame.buf, expected), 'Returned frame matched the expected frame');
            t.end();
        });
        fb.push(data_frame1.buf);
        fb.push(data_frame2.buf);
    });
    t.test('Key in 2 parts, and data in 2 parts with some extra past the frame.', function(t) {
        var fb = new FramingBuffer(),
            data_frame1,
            data_frame2,
            data_frame3,
            expected;

        data_frame1 = new OffsetBuffer(2);
        data_frame1.writeInt16BE(0); // length part 1
        data_frame2 = new OffsetBuffer(6);
        data_frame2.writeInt16BE(8); // length part 2
        data_frame2.writeInt32BE(12345); // data part 1
        data_frame3 = new OffsetBuffer(8);
        data_frame3.writeInt32BE(54321); // data part 2
        data_frame3.writeInt32BE(98765); // some data outside the frame
        expected = Buffer.concat([data_frame2.buf.slice(2), data_frame3.buf.slice(0, 4)]);
        fb.on('frame', function(frame) {
            t.ok(buffer_equal(frame.buf, expected), 'Returned frame matched the expected frame');
            t.equal(fb.current_frame_buffer.length, 4, 'FramingBuffer still contains the extra data');
            t.end();
        });
        fb.push(data_frame1.buf);
        fb.push(data_frame2.buf);
        fb.push(data_frame3.buf);
    });
    t.test('Two full frames in the same input data set', function(t) {
        var fb = new FramingBuffer(),
            data_frame,
            expected1,
            expected2,
            calls = 0;

        data_frame = new OffsetBuffer(4 + 4 + 4 + 8);
        data_frame.writeInt32BE(4); // length 1
        data_frame.writeInt32BE(12345); // data 1
        data_frame.writeInt32BE(8); // length 2
        data_frame.writeInt64BE(987654321);
        expected1 = data_frame.buf.slice(4, 8);
        expected2 = data_frame.buf.slice(12);
        fb.on('frame', function(frame) {
            calls++;
            if (calls === 1) {
                t.ok(buffer_equal(frame.buf, expected1), 'First returned frame matched the expected frame');
            } else {
                t.ok(buffer_equal(frame.buf, expected2), 'Second returned frame matched the expected frame');
                t.ok(true, '"frame" event called multiple times on the same push.');
                t.end();
            }
        });
        fb.push(data_frame.buf);
    });
});

function buffer_equal(buffer1, buffer2) {
    return buffer1.toString('hex') === buffer2.toString('hex');
}

