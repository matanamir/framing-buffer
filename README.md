# framing-buffer

[![Build Status](https://travis-ci.org/matanamir/framing-buffer.png)](https://travis-ci.org/matanamir/framing-buffer)

Used to easily parse variable-size frame data coming from sockets.  It allows a customizable frame
length reader if the default isn't acceptable (buf.readInt32BE()).

## Usage

To use it, set it as your 'data' event listener. When a full frame is found, the FrameBuffer
will emit a "frame" event which can be listened to to get the full frame without the frame size
header:

```js
var FramingBuffer = require('framing-buffer'),
    framing_buffer = new FramingBuffer();

framing_buffer.on('frame', function(frame) {
    // got my full frame!
});

my_socket.on('data', function(data) {
    framing_buffer.push(data);
});
```

If a custom frame length is required, you can provide the frame length field size and frame length
reader function as parameters to the constructor:

```js
// Example of using an unsigned short for the frame length field
var options = {
    frame_length_size: 2,
    frame_length_reader: function(offset_buffer) {
        return offset_buffer.readUInt16BE();
    }
};

var framing_buffer = new FramingBuffer(options);
```

Note that an [OffsetBuffer][1] is passed into the frame_length_reader function.

The FramingBuffer keeps track of only one data stream.  Keep an instance of this per steam
that needs framing (i.e. one per socket / connection).

## Install

```
npm install framing-buffer
```

## Tests

```
npm test
```

## License

MIT License

[1]: https://github.com/matanamir/offset-buffer